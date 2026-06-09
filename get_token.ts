const { GarminConnect } = require('@gooin/garmin-connect');

async function main() {
    const client = new GarminConnect({
        username: 'YOUR_GARMIN_GLOBAL_EMAIL',
        password: 'YOUR_GARMIN_GLOBAL_PASSWORD'
    });
    await client.login();
    const token = client.exportToken();
    console.log('OAUTH1:', JSON.stringify(token.oauth1));
    console.log('OAUTH2:', JSON.stringify(token.oauth2));
}

main().catch(console.error);
