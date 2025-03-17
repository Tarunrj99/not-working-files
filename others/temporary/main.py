from slack_bolt import App
from slack_bolt.adapter.flask import SlackRequestHandler
import requests
import re
import json

def get_secret(secret_id):
    from google.cloud import secretmanager
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/glossy-fastness-305315/secrets/{secret_id}/versions/latest"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode("UTF-8")

slack_token = get_secret("tarun-bot-token")
signing_secret = get_secret("tarun-signing-secret")
app = App(signing_secret=signing_secret, token=slack_token)
handler = SlackRequestHandler(app)

# Default users (overridden by Cloud Function if defined)
if "users" not in globals():
    users = {
        "U050DRWLZLG": "spa-token",
        "U07BC7QCEQM": "tpa-token"
    }
    # U050DRWLZLG = it's tarun user
    # U07BC7QCEQM = it's sameer user

emoji_actions = {
    "ok": {"action": "approve", "message": "{user_name} approved the changes"},
    "white_check_mark": {"action": "approve_and_merge", "message": "{user_name} approved the changes and PR merged"},
    "rocket": {"action": "approve_merge_delete", "message": "{user_name} approved the changes, PR merged, and branch deleted"},
    "+1": {"action": "approve", "message": "{user_name} approved the changes"}
}

@app.event("message")
def handle_message(event, say):
    pass  # No "Processing PR..." message

@app.event("reaction_added")
def handle_reaction(event, say):
    user = event["user"]
    reaction = event["reaction"]
    message_ts = event["item"]["ts"]
    channel = event["item"]["channel"]
    
    if user not in users or reaction not in emoji_actions:
        return

    bot_user_id = app.client.auth_test()["user_id"]
    try:
        response = app.client.conversations_replies(channel=channel, ts=message_ts, limit=10)
        if response["ok"] and response["messages"]:
            for msg in response["messages"]:
                if msg.get("user") != bot_user_id:
                    text = msg.get("text", "")
                    pr_match = re.search(r"https://github.com/[^ ]+/pull/[0-9]+", text)
                    pr_url = pr_match.group(0) if pr_match else None
                    if pr_url:
                        # LOG: Comment/uncomment to toggle PR URL logging --------------------- Commented below line
                        print(f"PR URL: {pr_url}")
                        github_pat = get_secret(users[user])
                        action_info = emoji_actions[reaction]
                        user_info = app.client.users_info(user=user)
                        user_name = user_info["user"]["real_name"] if user_info["ok"] else user
                        action = action_info["action"]
                        message = action_info["message"].format(user_name=user_name)
                        if action == "approve":
                            approve_pr(pr_url, github_pat, say, message, channel, message_ts)
                        elif action == "approve_and_merge":
                            approve_and_merge_pr(pr_url, github_pat, say, message, channel, message_ts)
                        elif action == "approve_merge_delete":
                            approve_merge_delete_pr(pr_url, github_pat, say, message, channel, message_ts)
                        return
    except Exception as e:
        # LOG: Comment/uncomment to toggle error logging
        print(f"Error: {str(e)}")

def approve_pr(pr_url, github_pat, say, message, channel, thread_ts):
    pr_number = pr_url.split("/")[-1]
    repo = "/".join(pr_url.split("/")[3:5])
    url = f"https://api.github.com/repos/{repo}/pulls/{pr_number}/reviews"
    headers = {"Authorization": f"token {github_pat}", "Accept": "application/vnd.github.v3+json"}
    data = {"event": "APPROVE"}
    try:
        response = requests.post(url, headers=headers, json=data, timeout=10)
        if response.status_code == 200:
            # LOG: Comment/uncomment to toggle status logging --------------------- Commented below line
            print(f"Status: PR {pr_url} approved")
            say(channel=channel, thread_ts=thread_ts, text=message)
        else:
            # LOG: Comment/uncomment to toggle error logging
            print(f"Error: Failed to approve PR {pr_url}: {response.text}")
    except Exception as e:
        # LOG: Comment/uncomment to toggle error logging
        print(f"Error: Approving PR {pr_url} failed: {str(e)}")

def approve_and_merge_pr(pr_url, github_pat, say, message, channel, thread_ts):
    pr_number = pr_url.split("/")[-1]
    repo = "/".join(pr_url.split("/")[3:5])
    headers = {"Authorization": f"token {github_pat}", "Accept": "application/vnd.github.v3+json"}
    try:
        approve_url = f"https://api.github.com/repos/{repo}/pulls/{pr_number}/reviews"
        approve_response = requests.post(approve_url, headers=headers, json={"event": "APPROVE"}, timeout=10)
        if approve_response.status_code == 200:
            merge_url = f"https://api.github.com/repos/{repo}/pulls/{pr_number}/merge"
            merge_response = requests.put(merge_url, headers=headers, timeout=10)
            if merge_response.status_code == 200:
                # LOG: Comment/uncomment to toggle status logging --------------------- Commented below line
                print(f"Status: PR {pr_url} approved and merged")
                say(channel=channel, thread_ts=thread_ts, text=message)
            else:
                # LOG: Comment/uncomment to toggle error logging
                print(f"Error: Failed to merge PR {pr_url}: {merge_response.text}")
        else:
            # LOG: Comment/uncomment to toggle error logging
            print(f"Error: Failed to approve PR {pr_url}: {approve_response.text}")
    except Exception as e:
        # LOG: Comment/uncomment to toggle error logging
        print(f"Error: Approving/merging PR {pr_url} failed: {str(e)}")

def approve_merge_delete_pr(pr_url, github_pat, say, message, channel, thread_ts):
    pr_number = pr_url.split("/")[-1]
    repo = "/".join(pr_url.split("/")[3:5])
    headers = {"Authorization": f"token {github_pat}", "Accept": "application/vnd.github.v3+json"}
    try:
        approve_url = f"https://api.github.com/repos/{repo}/pulls/{pr_number}/reviews"
        approve_response = requests.post(approve_url, headers=headers, json={"event": "APPROVE"}, timeout=10)
        if approve_response.status_code == 200:
            merge_url = f"https://api.github.com/repos/{repo}/pulls/{pr_number}/merge"
            merge_response = requests.put(merge_url, headers=headers, timeout=10)
            if merge_response.status_code == 200:
                pr_info_url = f"https://api.github.com/repos/{repo}/pulls/{pr_number}"
                pr_info = requests.get(pr_info_url, headers=headers, timeout=10).json()
                branch_name = pr_info["head"]["ref"]
                delete_url = f"https://api.github.com/repos/{repo}/git/refs/heads/{branch_name}"
                delete_response = requests.delete(delete_url, headers=headers, timeout=10)
                if delete_response.status_code == 204:
                    # LOG: Comment/uncomment to toggle status logging --------------------- Commented below line
                    print(f"Status: PR {pr_url} approved, merged, and branch deleted")
                    say(channel=channel, thread_ts=thread_ts, text=message)
                else:
                    # LOG: Comment/uncomment to toggle error logging
                    print(f"Error: Failed to delete branch for PR {pr_url}: {delete_response.text}")
            else:
                # LOG: Comment/uncomment to toggle error logging
                print(f"Error: Failed to merge PR {pr_url}: {merge_response.text}")
        else:
            # LOG: Comment/uncomment to toggle error logging
            print(f"Error: Failed to approve PR {pr_url}: {approve_response.text}")
    except Exception as e:
        # LOG: Comment/uncomment to toggle error logging
        print(f"Error: Approving/merging/deleting PR {pr_url} failed: {str(e)}")
