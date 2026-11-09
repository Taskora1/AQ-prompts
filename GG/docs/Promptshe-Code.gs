const SHEET_NAME = 'Sheet1';
const DEFAULT_COUNTRY_CODE = '92';
const TRIAL_DAYS = 3;
const RATE_LIMIT_SECONDS = 60;

function getPrivateConfig() {
  const properties = PropertiesService.getScriptProperties();
  const whatsappLink = properties.getProperty('WHATSAPP_LINK');
  const paymentLink = properties.getProperty('PAYMENT_LINK') || '';
  const sharedSecret = properties.getProperty('PROMPTSHE_SHARED_SECRET');

  if (!whatsappLink || !sharedSecret) {
    throw new Error('Required script property is missing.');
  }

  return { whatsappLink, paymentLink, sharedSecret };
}

function doPost(e) {
  try {
    const privateConfig = getPrivateConfig();
    const data = parseRequestData(e);

    if (cleanText(data.sharedSecret) !== privateConfig.sharedSecret) {
      return jsonResponse({ success: false, message: 'Unauthorized.' });
    }

    const name = cleanText(data.name);
    const countryCode = cleanDigits(data.countryCode || DEFAULT_COUNTRY_CODE) || DEFAULT_COUNTRY_CODE;
    const number = normalizePhone(data.phone, countryCode);

    if (!name || !number) {
      return jsonResponse({ success: false, message: 'Please enter your name and WhatsApp number.' });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const sheet = getSheet();
      ensureHeaders(sheet);
      const rows = sheet.getDataRange().getValues();
      const existing = findExistingNumber(rows, number);
      const now = new Date();

      if (existing) {
        const status = cleanText(existing.status).toLowerCase();
        const lastSubmitAt = parseSheetDate(existing.lastSubmitAt);

        if (lastSubmitAt && (now.getTime() - lastSubmitAt.getTime()) / 1000 < RATE_LIMIT_SECONDS) {
          return jsonResponse({
            success: false,
            message: 'Please wait a minute before submitting again.',
          });
        }

        sheet.getRange(existing.rowIndex, 6).setValue(now);

        if (status === 'joined' || status === 'member' || status === 'paid') {
          return jsonResponse({
            success: false,
            message: 'This WhatsApp number has already joined the community. Please contact admin if you need help.',
          });
        }

        if (status === 'trial used' || status === 'removed') {
          return jsonResponse({
            success: false,
            message: 'You have already used your free trial. Please purchase a membership to join.',
            paymentLink: privateConfig.paymentLink,
          });
        }

        return jsonResponse({
          success: false,
          message: 'This WhatsApp number is already registered for a trial. Please contact admin or purchase a membership to join again.',
          paymentLink: privateConfig.paymentLink,
        });
      }

      const joinDate = new Date();
      const trialEndDate = new Date(joinDate);
      trialEndDate.setDate(joinDate.getDate() + TRIAL_DAYS);

      sheet.appendRow([
        name,
        number,
        formatDate(joinDate),
        formatDate(trialEndDate),
        'Active Trial',
        now,
      ]);

      return jsonResponse({
        success: true,
        message: 'Welcome! Here is your community link.',
        joinLink: privateConfig.whatsappLink,
      });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return jsonResponse({
      success: false,
      message: 'Something went wrong. Please try again later.',
    });
  }
}

function doGet() {
  return jsonResponse({ success: true, message: 'Promptshe verification API is running.' });
}

function parseRequestData(e) {
  if (!e) return {};

  if (e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (error) {
      return e.parameter || {};
    }
  }

  return e.parameter || {};
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error('Sheet not found: ' + SHEET_NAME);
  }

  return sheet;
}

function ensureHeaders(sheet) {
  const headers = ['Name', 'Normalized Number', 'Join Date', 'Trial End Date', 'Status', 'Last Submit At'];
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasHeaders = headers.every(function (header, index) {
    return cleanText(firstRow[index]) === header;
  });

  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function findExistingNumber(rows, number) {
  for (let i = 1; i < rows.length; i++) {
    const rowNumber = normalizePhone(rows[i][1], DEFAULT_COUNTRY_CODE);

    if (rowNumber === number) {
      return {
        rowIndex: i + 1,
        status: rows[i][4],
        lastSubmitAt: rows[i][5],
      };
    }
  }

  return null;
}

function normalizePhone(value, countryCode) {
  let number = String(value || '').replace(/[\s\-()]/g, '').trim();
  const code = cleanDigits(countryCode || DEFAULT_COUNTRY_CODE) || DEFAULT_COUNTRY_CODE;

  number = number.replace(/[^\d+]/g, '');

  if (number.startsWith('00')) {
    number = number.slice(2);
  }

  if (number.startsWith('+')) {
    number = number.slice(1);
  }

  if (number.startsWith('0')) {
    number = code + number.slice(1);
  }

  return cleanDigits(number);
}

function cleanText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function cleanDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function parseSheetDate(value) {
  if (!value) return null;

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return value;
  }

  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
