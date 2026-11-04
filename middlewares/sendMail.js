const { EmailClient } = require("@azure/communication-email");

const sendMail = async ({ to, subject, text, html, replyTo }) => {
    const client = new EmailClient(process.env.AZURE_COMMUNICATION_CONNECTION_STRING);
    const message = {
        senderAddress: process.env.AZURE_SENDER_ADDRESS,
        recipients: {
            to: [{ address: to }],
        },
        // Lets the recipient hit "reply" to answer e.g. the visitor who sent an enquiry.
        ...(replyTo && { replyTo: [{ address: replyTo }] }),
        content: {
            subject,
            plainText: text,
            ...(html && { html }),
        },
    };

    const poller = await client.beginSend(message);
    const result = await poller.pollUntilDone();
    console.log("Email sent, messageId:", result.id);
};

module.exports = sendMail;
