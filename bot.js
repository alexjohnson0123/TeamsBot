const { ActivityHandler, MessageFactory } = require('botbuilder');

class CortexBot extends ActivityHandler {
    constructor() {
        super();

        this.accessToken = ""

        // See https://aka.ms/about-bot-activity-message to learn more about the message and other activity types.
        this.onMessage(async (context, next) => {
            await this.#AskLLM(context.activity.text)
                .then(replyText => context.sendActivity(MessageFactory.text(replyText, replyText)));
            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });

        this.onMembersAdded(async (context, next) => {
            const membersAdded = context.activity.membersAdded;
            const welcomeText = 'Hello! You are now speaking to llama3.1-405b.';
            for (let cnt = 0; cnt < membersAdded.length; ++cnt) {
                if (membersAdded[cnt].id !== context.activity.recipient.id) {
                    await context.sendActivity(MessageFactory.text(welcomeText, welcomeText));
                }
            }
            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });
    }

    setAccessToken(foo) {
        this.accessToken = foo;
    }

    async #AskLLM(queryText) {
        const accessToken = this.accessToken;

        const response = await fetch("https://uhortkh-xqa72614.snowflakecomputing.com/api/v2/cortex/inference:complete", {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Snowflake-Authorization-Token-Type': 'PROGRAMMATIC_ACCESS_TOKEN'
            },
            body: JSON.stringify({
                'model': 'llama3.1-405b',
                'messages': [{'content': queryText, 'role':'user'}],
                'stream': false,
            })
        });

        const json = await response.json();
        return json.choices[0].message.content;
    }
}

module.exports.CortexBot = CortexBot;
