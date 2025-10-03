const { ActivityHandler, MessageFactory } = require('botbuilder');

const MODEL_NAME = 'llama3.1-405b';
const TOKEN_INTERVAL = 3450 * 1000;

class CortexBot extends ActivityHandler {
    #accessToken;

    static staticVar = 0;
    
    constructor(accessToken, clientId, clientSecret, tennantId, scope) {
        super();

        this.#accessToken = accessToken;
        setInterval(() => this.#accessToken = getOAuthToken(), TOKEN_INTERVAL);
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.tennantId = tennantId;
        this.scope = scope;

        this.messageHistory = new Map();

        // See https://aka.ms/about-bot-activity-message to learn more about the message and other activity types.
        this.onMessage(async (context, next) => {
            const userId = context.activity.from.id;
            const messageText = context.activity.text;

            if(!this.messageHistory.has(userId)) {this.messageHistory.set(userId, []) }

            let replyText = "";

            if(messageText.toLowerCase() === 'clear history') {
                this.messageHistory.set(userId, []);
                replyText = "SYSTEM: Chat history cleared.";
            } else {
                this.messageHistory.get(userId).push(createMessage(messageText, messageText));
                replyText = await askLLM(this.#accessToken, this.messageHistory.get(userId));
            }
            await context.sendActivity(MessageFactory.text(replyText, replyText));
            
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

    static async createBot(clientId, clientSecret, tennantId, scope) {
        const token = await getOAuthToken(clientId, clientSecret, tennantId, scope);
        return new CortexBot(token);
    }

}

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

async function getOAuthToken(clientId, clientSecret, tennantId, scope) {

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);
    params.append("scope", scope);
    params.append("grant_type", "client_credentials");

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
}

function createMessage(content, user) {
    return {'content': content, 'user': user};
}

module.exports.CortexBot = CortexBot;
