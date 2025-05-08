let DEBUG_LOG = true; // Default to true — will be overridden by config

function getConfiguration() {
  const CONFIG_URL = "https://raw.githubusercontent.com/Tarunrj99/not-working-files/refs/heads/main/test-tem-task/System/config/config.json";
  const USE_LOCAL_CONFIG = true; // Set to true to override remote config

  const localConfig = {
    SHEET_NAME_CELL: "Emails",
    TEST_MODE: false,
    DAILY_LIMIT: 2,
    HOURLY_LIMIT: 5,
    EMAIL_GAP_MS: 60 * 1000,
    ALLOWED_DAYS: [1, 2, 3, 4],
    ALLOWED_TIME_START: "00:00",
    ALLOWED_TIME_END: "12:00",
    DEBUG_LOG: true
  };

  // Convert number-based time inputs to strings
  if (typeof localConfig.ALLOWED_TIME_START === "number") {
    localConfig.ALLOWED_TIME_START = `${Math.floor(localConfig.ALLOWED_TIME_START)}:00`;
  }
  if (typeof localConfig.ALLOWED_TIME_END === "number") {
    localConfig.ALLOWED_TIME_END = `${Math.floor(localConfig.ALLOWED_TIME_END)}:00`;
  }

  if (USE_LOCAL_CONFIG) {
    log("Using local configuration.");
    return localConfig;
  }

  try {
    const response = UrlFetchApp.fetch(CONFIG_URL, { muteHttpExceptions: true });
    const statusCode = response.getResponseCode();
    if (statusCode === 200) {
      log("Configuration fetched successfully.");
      let config = JSON.parse(response.getContentText());
      if (typeof config.ALLOWED_TIME_START === "number") {
        config.ALLOWED_TIME_START = `${Math.floor(config.ALLOWED_TIME_START)}:00`;
      }
      if (typeof config.ALLOWED_TIME_END === "number") {
        config.ALLOWED_TIME_END = `${Math.floor(config.ALLOWED_TIME_END)}:00`;
      }
      return config;
    } else {
      log(`Failed to fetch configuration. HTTP Status: ${statusCode}`);
      return localConfig;
    }
  } catch (error) {
    log(`Error fetching configuration: ${error.message}`);
    return localConfig;
  }
}

function getEmailTemplate() {
  const TEMPLATE_URL = "https://raw.githubusercontent.com/Tarunrj99/Automated-Email-Sending-System/refs/heads/main/templates/tarun-explore-devops-role-template.html";

  try {
    const response = UrlFetchApp.fetch(TEMPLATE_URL, { muteHttpExceptions: true });
    const statusCode = response.getResponseCode();
    if (statusCode === 200) {
      log("Email template fetched successfully.");
      return response.getContentText();
    } else {
      log(`Failed to fetch email template. HTTP Status: ${statusCode}`);
      return "<p>Could not load email template.</p>";
    }
  } catch (error) {
    log(`Error fetching email template: ${error.message}`);
    return "<p>Could not load email template.</p>";
  }
}

function getMainScript() {
  const SCRIPT_URL = "https://raw.githubusercontent.com/Tarunrj99/Automated-Email-Sending-System/refs/heads/main/scripts/send-emails.gs";

  try {
    const response = UrlFetchApp.fetch(SCRIPT_URL, { muteHttpExceptions: true });
    const statusCode = response.getResponseCode();
    if (statusCode === 200) {
      log("Main script fetched successfully.");
      return response.getContentText();
    } else {
      log(`Failed to fetch main script. HTTP Status: ${statusCode}`);
      return "";
    }
  } catch (error) {
    log(`Error fetching main script: ${error.message}`);
    return "";
  }
}

function isWithinAllowedTime(now, startStr, endStr) {
  if (!startStr || !endStr) {
    log("⚠️ Time window not defined properly. Skipping time check.");
    return true;
  }

  const [startHour, startMin = 0] = startStr.split(":").map(Number);
  const [endHour, endMin = 0] = endStr.split(":").map(Number);

  if (startHour < 0 || startHour > 23 || startMin < 0 || startMin > 59 ||
      endHour < 0 || endHour > 23 || endMin < 0 || endMin > 59) {
    log(`❌ Invalid time format: ${startStr}–${endStr}. Skipping time check.`);
    return true;
  }

  const startTime = new Date(now);
  startTime.setHours(startHour, startMin, 0, 0);

  const endTime = new Date(now);
  endTime.setHours(endHour, endMin, 59, 999); // Inclusive end time

  return now >= startTime && now <= endTime;
}

function parseSentAt(sentAt) {
  if (!sentAt) return null;

  const tz = Session.getScriptTimeZone();

  // Handle Date objects directly
  if (sentAt instanceof Date && !isNaN(sentAt.getTime())) {
    const formatted = Utilities.formatDate(sentAt, tz, "dd/MM/yyyy HH:mm:ss");
    try {
      const parsed = Utilities.parseDate(formatted, tz, "dd/MM/yyyy HH:mm:ss");
      log(`🔍 Parsed Sent At as Date object (reformatted): ${sentAt} -> ${formatted} (Date: ${parsed.getFullYear()}-${parsed.getMonth()+1}-${parsed.getDate()})`);
      return parsed;
    } catch (e) {
      log(`⚠️ Failed to reparse Date object as dd/MM/yyyy HH:mm:ss: ${sentAt}`);
    }
  }

  // Try parsing as dd/MM/yyyy HH:mm:ss (sheet format)
  try {
    const parsed = Utilities.parseDate(sentAt, tz, "dd/MM/yyyy HH:mm:ss");
    if (!isNaN(parsed.getTime())) {
      log(`🔍 Parsed Sent At as dd/MM/yyyy HH:mm:ss: ${sentAt} (Date: ${parsed.getFullYear()}-${parsed.getMonth()+1}-${parsed.getDate()})`);
      return parsed;
    }
  } catch (e) {
    log(`⚠️ Failed to parse Sent At as dd/MM/yyyy HH:mm:ss: ${sentAt}`);
  }

  // Try parsing as MMM dd yyyy HH:mm:ss z (e.g., Tue Aug 05 2025 07:07:32 GMT+0530)
  try {
    const parsed = new Date(sentAt);
    if (!isNaN(parsed.getTime())) {
      // Manually adjust for dd/MM/yyyy: assume "Aug 05" is 05/08 (day/month)
      const formatted = Utilities.formatDate(parsed, tz, "dd/MM/yyyy HH:mm:ss");
      const reparsed = Utilities.parseDate(formatted, tz, "dd/MM/yyyy HH:mm:ss");
      log(`🔍 Parsed Sent At as MMM dd yyyy HH:mm:ss z: ${sentAt} -> Reformatted: ${formatted} (Date: ${reparsed.getFullYear()}-${reparsed.getMonth()+1}-${reparsed.getDate()})`);
      return reparsed;
    }
  } catch (e) {
    log(`⚠️ Failed to parse Sent At as MMM dd yyyy HH:mm:ss z: ${sentAt}`);
  }

  // Fallback: Try new Date and reformat
  try {
    const parsed = new Date(sentAt);
    if (!isNaN(parsed.getTime())) {
      const formatted = Utilities.formatDate(parsed, tz, "dd/MM/yyyy HH:mm:ss");
      const reparsed = Utilities.parseDate(formatted, tz, "dd/MM/yyyy HH:mm:ss");
      log(`🔍 Parsed Sent At as fallback Date: ${sentAt} -> Reformatted: ${formatted} (Date: ${reparsed.getFullYear()}-${reparsed.getMonth()+1}-${reparsed.getDate()})`);
      return reparsed;
    }
  } catch (e) {
    log(`⚠️ Failed to parse Sent At as fallback Date: ${sentAt}`);
  }

  log(`❌ Invalid Sent At timestamp: ${sentAt}`);
  return null;
}

function sendExploreEmails() {
  log("⏳ Starting sendExploreEmails...");

  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(10000)) {
      log("❌ Could not acquire lock. Another execution may be running.");
      return;
    }

    const final_templates = {
      "template-1": "https://raw.githubusercontent.com/Tarunrj99/Automated-Email-Sending-System/refs/heads/main/templates/tarun-explore-devops-role-template.html",
      "template-2": "https://raw.githubusercontent.com/Tarunrj99/not-working-files/refs/heads/main/test-tem-task/local/data/my/tarun-sharing-cv-for-devops-role-template.html",
      "template-3": "https://raw.githubusercontent.com/Tarunrj99/not-working-files/refs/heads/main/test-tem-task/local/data/my/tarun-sharing-cv-for-senior-devops-role-template.html",
      "template-4": "https://raw.githubusercontent.com/Tarunrj99/not-working-files/refs/heads/main/test-tem-task/local/data/my/tarun-sharing-cv-for-cloud-role-template.html",
      "template-5": "https://raw.githubusercontent.com/Tarunrj99/not-working-files/refs/heads/main/test-tem-task/local/data/my/tarun-sharing-cv-for-senior-devops-role-template.html"
    };

    const fallback_template = "<p>Could not load email template. Please contact support.</p>";

    let config;
    try {
      config = getConfiguration();
      DEBUG_LOG = config.DEBUG_LOG ?? true;
      log("✅ Configuration fetched successfully.");
      log("🔍 Config content: " + JSON.stringify(config));
    } catch (e) {
      log("❌ Failed to load config: " + e);
      return;
    }

    const {
      SHEET_NAME_CELL,
      TEST_MODE,
      DAILY_LIMIT,
      HOURLY_LIMIT,
      EMAIL_GAP_MS,
      ALLOWED_DAYS,
      ALLOWED_TIME_START,
      ALLOWED_TIME_END
    } = config;

    const SHEET_NAME = SHEET_NAME_CELL;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      log("❌ Sheet not found: " + SHEET_NAME);
      return;
    }

    log("✅ Sheet loaded. Proceeding with data.");
    const data = sheet.getDataRange().getValues();
    const now = new Date();
    const currentDay = now.getDay();

    if (!TEST_MODE && !ALLOWED_DAYS.includes(currentDay)) {
      log(`⛔ Exiting: Today (day ${currentDay}) is not an allowed day.`);
      return;
    }

    if (!TEST_MODE && !isWithinAllowedTime(now, ALLOWED_TIME_START, ALLOWED_TIME_END)) {
      log(`⛔ Exiting: Current time (${Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm:ss")}) is outside allowed range (${ALLOWED_TIME_START}–${ALLOWED_TIME_END}).`);
      return;
    }

    let sentThisRun = 0;
    let dailyCount = 0;
    let hourlyCount = 0;

    // Count already sent emails
    for (let i = 1; i < data.length; i++) {
      const sentAt = data[i][6];
      log(`🔍 Raw Sent At in Sheet Row ${i + 1}: ${sentAt}`);
      const sentDate = parseSentAt(sentAt);
      if (sentDate && !isNaN(sentDate.getTime())) {
        const formattedSentDate = Utilities.formatDate(sentDate, Session.getScriptTimeZone(), "dd/MM/yyyy");
        const formattedNow = Utilities.formatDate(now, Session.getScriptTimeZone(), "dd/MM/yyyy");
        const isSame = isSameDay(sentDate, now);
        log(`🔍 Comparing: Sent At ${formattedSentDate} (Date: ${sentDate.getFullYear()}-${sentDate.getMonth()+1}-${sentDate.getDate()}) vs Now ${formattedNow} (Date: ${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}) -> Same Day: ${isSame}`);
        if (isSame) {
          dailyCount++;
          log(`📅 Sheet Row ${i + 1} counted in dailyCount: Sent At ${sentAt} (Parsed: ${formattedSentDate})`);
        }
        if (isSameHour(sentDate, now)) {
          hourlyCount++;
          log(`🕒 Sheet Row ${i + 1} counted in hourlyCount: Sent At ${sentAt} (Parsed: ${formattedSentDate})`);
        }
      }
    }

    log(`📈 Sent today: ${dailyCount}/${DAILY_LIMIT}, this hour: ${hourlyCount}/${HOURLY_LIMIT}`);

    // Set number format for Sent At column (G) to ensure consistency
    sheet.getRange("G2:G" + sheet.getLastRow()).setNumberFormat("dd/mm/yyyy hh:mm:ss");

    for (let i = 1; i < data.length; i++) {
      if (sentThisRun >= HOURLY_LIMIT || dailyCount >= DAILY_LIMIT || hourlyCount >= HOURLY_LIMIT) {
        log(`🚫 Limit reached: sentThisRun=${sentThisRun}/${HOURLY_LIMIT}, dailyCount=${dailyCount}/${DAILY_LIMIT}, hourlyCount=${hourlyCount}/${HOURLY_LIMIT}`);
        break;
      }

      const email = data[i][1];
      const cc = data[i][2];
      const templateKey = data[i][3];
      const ready = data[i][4];
      const status = data[i][5];

      log(`🔁 Sheet Row ${i + 1} | Email: ${email} | Template: ${templateKey} | Ready: ${ready} | Status: ${status}`);

      if (status === "Sent" || !email || !(ready === true || ready === "TRUE")) {
        log(`⚠️ Skipping Sheet Row ${i + 1}`);
        continue;
      }

      if (!final_templates.hasOwnProperty(templateKey)) {
        log(`⚠️ Invalid template key in Sheet Row ${i + 1}: ${templateKey}`);
        continue;
      }

      let htmlBody;
      try {
        log(`🔍 Fetching template URL for ${templateKey}: ${final_templates[templateKey]}`);
        const response = UrlFetchApp.fetch(final_templates[templateKey], { muteHttpExceptions: true });
        if (response.getResponseCode() !== 200) throw new Error(`Template fetch failed: HTTP ${response.getResponseCode()}`);
        htmlBody = response.getContentText();
        log(`✅ Template ${templateKey} fetched successfully for Sheet Row ${i + 1}`);
      } catch (e) {
        log(`❌ Failed to load template ${templateKey} for Sheet Row ${i + 1}: ${e}`);
        htmlBody = fallback_template;
      }

      const subject = extractSubjectFromTemplate(htmlBody);
      const plainBody = "Hello, I am exploring opportunities in DevOps/Cloud. Please view the HTML version if available.";

      try {
        const mailOptions = {
          htmlBody: htmlBody
        };
        if (cc && cc.toString().trim() !== "") {
          mailOptions.cc = cc;
        }

        GmailApp.sendEmail(email, subject, plainBody, mailOptions);

        const timeStamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
        sheet.getRange(i + 1, 6).setValue("Sent");
        sheet.getRange(i + 1, 7).setValue(timeStamp);
        SpreadsheetApp.flush(); // Ensure sheet updates are saved immediately

        log(`✅ Email sent to ${email} with ${templateKey} at ${timeStamp} for Sheet Row ${i + 1}`);
        log(`📊 Pre-update counts: sentThisRun=${sentThisRun}/${HOURLY_LIMIT}, dailyCount=${dailyCount}/${DAILY_LIMIT}, hourlyCount=${hourlyCount}/${HOURLY_LIMIT}`);

        sentThisRun++;
        dailyCount++;
        hourlyCount++;

        log(`📊 Updated counts: sentThisRun=${sentThisRun}/${HOURLY_LIMIT}, dailyCount=${dailyCount}/${DAILY_LIMIT}, hourlyCount=${hourlyCount}/${HOURLY_LIMIT}`);

        if (sentThisRun < HOURLY_LIMIT && i < data.length - 1 && dailyCount < DAILY_LIMIT && hourlyCount < HOURLY_LIMIT) {
          log("⏱ Sleeping before next email...");
          Utilities.sleep(EMAIL_GAP_MS);
        }
      } catch (e) {
        log(`❌ Failed sending to ${email} for Sheet Row ${i + 1}: ${e}`);
      }
    }

    log(`✅ Finished. Emails sent this run: ${sentThisRun}`);
  } finally {
    lock.releaseLock();
  }
}

function isSameDay(date1, date2) {
  const tz = Session.getScriptTimeZone();
  const date1Str = Utilities.formatDate(date1, tz, "dd/MM/yyyy");
  const date2Str = Utilities.formatDate(date2, tz, "dd/MM/yyyy");
  const result = date1Str === date2Str;
  log(`🔍 isSameDay: ${date1Str} vs ${date2Str} -> ${result}`);
  return result;
}

function isSameHour(date1, date2) {
  return isSameDay(date1, date2) && date1.getHours() === date2.getHours();
}

function extractSubjectFromTemplate(templateContent) {
  const matches = templateContent.match(/<!--\s*SUBJECT\s*-->\s*\n*<!--\s*(.*?)\s*-->/i);
  return matches ? matches[1].trim() : "No Subject Found";
}

function log(message) {
  if (DEBUG_LOG) Logger.log(message);
}

function createTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  const exists = triggers.some(t => t.getHandlerFunction() === "sendExploreEmails");

  if (!exists) {
    ScriptApp.newTrigger("sendExploreEmails")
      .timeBased()
      .everyHours(1)
      .create();
    Logger.log("✅ Trigger created successfully.");
  } else {
    Logger.log("⚠️ Trigger already exists. No new trigger created.");
  }
}
