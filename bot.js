const { ActivityHandler, MessageFactory } = require('botbuilder');
const snowflake = require('snowflake-sdk');

const MODEL_NAME = 'llama3.1-405b';
const TOKEN_INTERVAL = 3450 * 1000;

let connection;
connect();
setInterval(() => connect(), TOKEN_INTERVAL);

class CortexBot extends ActivityHandler {
    static staticVar = 0;
    
    constructor() {
        super();

        this.messageHistory = new Map();

        // See https://aka.ms/about-bot-activity-message to learn more about the message and other activity types.
        this.onMessage(async (context, next) => {
            const userId = context.activity.from.id;
            const messageText = context.activity.text;

            if(!this.messageHistory.has(userId)) {this.messageHistory.set(userId, []) }
            const userMessages = this.messageHistory.get(userId);

            let replyText = "";

            if(messageText.toLowerCase() === 'clear history') {
                this.messageHistory.set(userId, []);
                replyText = "SYSTEM: Chat history cleared.";
            } else {
                userMessages.push(createMessage(messageText, 'user'));
                replyText = await askLLMDriver(userMessages);
                console.log('Reply Text:', typeof replyText);
            }
            await context.sendActivity(MessageFactory.text(replyText, replyText));
            userMessages.push(createMessage(replyText, 'assistant'));
            
            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });

        this.onMembersAdded(async (context, next) => {
            const membersAdded = context.activity.membersAdded;
            const welcomeText = `Hello! You are now speaking to ${MODEL_NAME}.`;
            for (let cnt = 0; cnt < membersAdded.length; ++cnt) {
                if (membersAdded[cnt].id !== context.activity.recipient.id) {
                    await context.sendActivity(MessageFactory.text(welcomeText, welcomeText));
                }
            }
            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });


    }
}

async function connect() {
    const authToken = await getOAuthToken(
        process.env.OAUTH_CLIENT_ID,
        process.env.OAUTH_CLIENT_SECRET,
        process.env.AZURE_AD_TENNANT_ID,
        process.env.AZURE_RESOURCE_URI
    );
    connection = snowflake.createConnection({
        account: 'uhortkh-xqa72614',
        role: 'public',
        authenticator: "OAUTH",
        token: authToken
    });
    connection.connect((err, conn) => {
        if (err) {
            console.error('Unable to connect to Snowflake: ', err.message);
        } else {
            console.log('Connected to Snowflake.')
        }
    });
};

async function askLLMDriver(prompt) {
    const sqlText = `SELECT SNOWFLAKE.CORTEX.COMPLETE(
        '${MODEL_NAME}',
        PARSE_JSON(?),
        PARSE_JSON('{}')
    ) as RESPONSE;`

    return new Promise((resolve, reject) => {
        connection.execute({
            sqlText: sqlText,
            binds: [JSON.stringify(prompt)],
            complete: (err, stmt, rows) => {
                if(err) {
                    reject(err);
                } else {
                    const response = rows[0].RESPONSE.choices[0].messages;
                    resolve(response);
                }
            }
        });
    }); 
}

// Function for querying Snowflake using the REST API instead of the Node.js driver
/*
async function askLLM(accessToken, messages) {

    try {
        const response = await fetch("https://uhortkh-xqa72614.snowflakecomputing.com/api/v2/cortex/inference:complete", {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Snowflake-Authorization-Token-Type': 'OAUTH'
            },
            body: JSON.stringify({
                'model': MODEL_NAME,
                'messages': messages,
                'stream': false,
            })
        });

        const json = await response.json();
        return json.choices[0].message.content;
    } catch (err) {
        console.error('Error encountered while querying LLM: ', err);
        return 'Error encountered while querying LLM.';
    }
}
*/

async function getOAuthToken(clientId, clientSecret, tennantId, scope) {

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);
    params.append("scope", scope);
    params.append("grant_type", "client_credentials");

    try {
        const response = await fetch(`https://login.microsoftonline.com/${tennantId}/oauth2/v2.0/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
        });
        const obj = await response.json();
        const token = obj.access_token;

        return token;
    } catch (err) {
        console.error('Error whil geting OAuth token: ', err);
    }
}

function createMessage(content, role) {
    return {'role': role, 'content': content};
}

module.exports.CortexBot = CortexBot;
