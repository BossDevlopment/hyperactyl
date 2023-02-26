const settings = require("../settings.json");
const fetch = require("node-fetch");
const { google } = require('googleapis');
const oAuth2Client = new google.auth.OAuth2(
    settings.api.client.google.clientid, settings.api.client.google.clientsecret, settings.api.client.google.link + "/auth/google/callback");
const scopes = ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.profile'];
const indexjs = require("../index.js");
const fs = require("fs");
const { resetRetrieveHandlers } = require("source-map-support");

module.exports.load = async function(app, db) {
    
app.get('/auth/google', (req, res) => {
    const authorizeUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
    });
    res.redirect(authorizeUrl);
  });
  
  app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    try {

      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);
  
      const oauth2 = google.oauth2({ version: 'v2', auth: oAuth2Client });
      const userInfo = await oauth2.userinfo.get();
      const { email, name, id, given_name, family_name, picture } = userInfo.data;
      
      let userid = id
        let theme = indexjs.get(req);
        let failedcallback = theme.settings.redirect.failedcallback || "/";

        let newsettings = JSON.parse(fs.readFileSync("./settings.json"));
        let genpassword = null;
            if (newsettings.api.client.passwordgenerator.signup == true) genpassword = makeid(newsettings.api.client.passwordgenerator["length"]);

        const userinfo = {
          username: given_name, 
          id: userid,
          password: genpassword,
          discriminator: null,
          discord: false,
          type: "google",
          profilepic: picture
        }

        if (!await db.get("users-" + userid)) {
          if (newsettings.api.client.allow.newusers == true) {

            let accountjson = await fetch(
              settings.pterodactyl.domain + "/api/application/users",
              {
                method: "post",
                headers: {
                  'Content-Type': 'application/json',
                  "Authorization": `Bearer ${settings.pterodactyl.key}`
                },
                body: JSON.stringify({
                  username: userid,
                  email: email,
                  first_name: given_name,
                  last_name: family_name,
                  password: genpassword
                })
              }
            );
            if (await accountjson.status == 201) {
              let accountinfo = JSON.parse(await accountjson.text());
              let userids = await db.get("users") || [];
              userids.push(accountinfo.attributes.id);
              await db.set("users", userids);
              let id = makeid(8)
              const referid = {
                userid: userid,
                inuse: true
              }
              await db.set("referuserid-" + id, referid)
              await db.set("referiduser-" + userid, id)
              await db.set("users-" + userid, accountinfo.attributes.id);
              const userdetails = {
                  username: given_name, 
                  id: userid,
                  password: genpassword,
                  discriminator: null,
                  discord: false,
                  type: "google",
                  profilepic: picture
              }
              await db.set("userinfo-" + userid, userdetails)
              req.session.newaccount = true;
              req.session.password = genpassword;
            } 
          } else {
            return res.redirect(failedcallback + "?err=DISABLED")
          }
        };

        let cacheaccount = await fetch(
          settings.pterodactyl.domain + "/api/application/users/" + (await db.get("users-" + userid)) + "?include=servers",
          {
            method: "get",
            headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${settings.pterodactyl.key}` }
          }
        );
        if (await cacheaccount.statusText == "Not Found") return res.redirect(failedcallback + "?err=CANNOTGETINFO");
        let cacheaccountinfo = JSON.parse(await cacheaccount.text());
        req.session.pterodactyl = cacheaccountinfo.attributes;

        req.session.userinfo = userinfo;
        
        return res.redirect("/dashboard");
    } catch (error) {
      console.error(error);
      res.status(400).send('Error during Google authentication');
    }
  });
  
    function makeid(length) {
      let result = '';
      let characters = 'ABCEDFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let charactersLength = characters.length;
      for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
      }
      return result;
    }
  
  
}