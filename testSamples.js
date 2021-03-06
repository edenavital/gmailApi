const fs = require("fs");
const readline = require("readline");
const { google } = require("googleapis");
const { JSDOM } = require("jsdom");
const open = require("open");
const base64 = require("js-base64").Base64;

// If modifying these scopes, delete token.json.
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://mail.google.com",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
];

//The id of our label - OPENED_VIA_BOT
const ADD_LABEL = "Label_4568886910162244987";
const TRASH_LABEL = "TRASH";

// TODO: refresh token.json when it's expired - automate the flow

// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = "token.json";

// Load client secrets from a local file.
fs.readFile("credentials.json", (err, content) => {
  if (err) return console.log("Error loading client secret file:", err);
  // Authorize a client with credentials, then call the Gmail API.
  authorize(JSON.parse(content), getListOfEmails);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const { client_secret, client_id, redirect_uris } = credentials.web;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    console.log("token", token);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  console.log("Authorize this app by visiting this url:", authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question("Enter the code from that page here: ", (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error("Error retrieving access token", err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log("Token stored to", TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

/**
 * Lists the labels in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */

// get relevant emails
async function getListOfEmails(auth) {
  const gmail = google.gmail({ version: "v1", auth });

  // Getting messages array containing only id, threadId per message
  try {
    const res = await gmail.users.messages.list({
      version: "v1",
      auth,
      userId: "me",
    });

    // If we got a list of messages - get the data from each message, currently on one message only
    if (res?.data?.messages) {
      const {
        data: { messages },
      } = res;
      // filter out messages that are not relevant!
      console.log("BEFORE FILTER - length", messages.length);

      const messagesIdList = messages.map(async (message) => {
        return await gmail.users.messages.get({
          userId: "me",
          auth,
          id: message.id,
        });
      });

      // Getting the actual data and not just ids
      const messagesData = await Promise.all(messagesIdList);
      let filteredMessages = filterUnrelevantMessage(messagesData);

      // for testing purposes - running only 3 recent emails
      filteredMessages = filteredMessages.splice(0, 5);
      console.log("AFTER FILTER - length", filteredMessages.length);

      filteredMessages.forEach(async (message) => {
        console.log(message);
        // Store the data of the email for convinient purposes
        // writeDataFile(currentMsg, "./emailData.json", true);
        decodeMessageData(message, gmail);
      });
    }
  } catch (err) {
    return console.log("The API returned an error: " + err);
  }
}

const isRelevantEmail = (email) => {
  if (email?.data?.payload?.headers) {
    const headers = email.data.payload.headers;
    for (let i = 0; i < headers.length; i++) {
      const { name, value } = headers[i];
      if (
        name &&
        name === "From" &&
        value.includes("no-reply@komo.co.il" || "komo.co.il" || "KOMO.co.il")
      ) {
        console.log("FOUND RELEVANT EMAIL");
        return true;
      }
    }
  }
  return false;
};

// Getting raw messages and filter out unrelevant messages
const filterUnrelevantMessage = (messages) => {
  return messages.filter((msg) => isRelevantEmail(msg));
};

// Getting a message, and decode it's data into raw html
const decodeMessageData = (messageData, gmail) => {
  const bodyData = messageData.data.payload.parts[0].body.data;

  // Simplified code: you'd need to check for multipart.
  const html = base64.decode(bodyData.replace(/-/g, "+").replace(/_/g, "/"));
  // console.log(data);
  // writeDataFile(data, "./savedHtml.html");
  openRelevantLinks(html, messageData, gmail);
};

// getting the html data of a single email and open the relevant link.
const openRelevantLinks = (html, messageData, gmail) => {
  const dom = new JSDOM(html);
  const elements = dom.window.document.getElementsByTagName("a");
  // console.log(dom.window.document.getElementsByTagName("a"));

  for (let elem of elements) {
    // console.log(elem.text);
    // From all the x a tags - take the only relevant one and open it
    if (elem.text.includes("???????? ???????????? ????????????")) {
      console.log(elem.href);
      open(elem.href);
      addLabelToEmail(messageData, gmail);
    }
  }
};

/**
 * Lists the labels in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
// function listLabels(auth) {
//   const gmail = google.gmail({ version: "v1", auth });
//   gmail.users.labels.list(
//     {
//       userId: "me",
//     },
//     (err, res) => {
//       if (err) return console.log("The API returned an error: " + err);
//       const labels = res.data.labels;
//       if (labels.length) {
//         console.log("Labels:");
//         labels.forEach((label) => {
//           console.log(`- ${label.name} - ${label.id}`);
//         });
//       } else {
//         console.log("No labels found.");
//       }
//     }
//   );
// }

const addLabelToEmail = async (messageData, gmail) => {
  gmail.users.messages.modify(
    {
      userId: "me",
      id: messageData.data.id,
      resource: {
        addLabelIds: [ADD_LABEL, TRASH_LABEL],
        removeLabelIds: [],
      },
    },
    function (err) {
      if (err) {
        console.error("Failed to mark email as read! Error: " + err);
        return;
      }
      console.log("Successfully marked email as read", messageData.data.id);
    }
  );
};

// Store json or string into a file
writeDataFile = async (message, path, isObject) => {
  try {
    await fs.writeFile(path, isObject ? JSON.stringify(message) : message, () =>
      console.log("The file was saved!")
    );
  } catch (err) {
    console.log("writeDataFile error - ", err);
  }
};
