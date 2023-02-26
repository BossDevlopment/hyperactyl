const settings = require("../settings.json");
const fetch = require("node-fetch");
const validator = require("email-validator");
const indexjs = require("../index.js");

module.exports.load = async function(app, db) {
    app.get("/auth/email/login", async (req, res) => {
      if (!req.query.email || !req.query.password) return res.send("<br>Missing information.<br>")
        const user = await db.get(`user-${req.query.email}`);
        const passwords = await db.get(`passwords-${req.query.email}`);
        if (!user) return res.send({error: "Invalid Email or Password."});
        if (passwords !== req.query.password) return res.send({error: "Invalid Password."});

        let ip = (settings.api.client.oauth2.ip["trust x-forwarded-for"] == true ? (req.headers['x-forwarded-for'] || req.connection.remoteAddress) : req.connection.remoteAddress);
        let userip = (ip ? ip : "::1").replace(/::1/g, "::ffff:127.0.0.1").replace(/^.*:/, '');

        let cacheaccount = await fetch(
            `${settings.pterodactyl.domain}/api/application/users/${await db.get(`users-${req.query.email}`)}?include=servers`,
            {
              method: "get",
              headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${settings.pterodactyl.key}` }
            }
          );
        if (await cacheaccount.statusText == "Not Found") return res.send("An error has occured while attempting to get your user information.");
        cacheaccount = JSON.parse(await cacheaccount.text());
        await db.set(`lastlogin-${req.query.email}`, Date.now());

        req.session.pterodactyl = cacheaccount.attributes;
        req.session.userinfo = user;

        return res.redirect("/dashboard")
    });

    app.get("/auth/email/register", async (req, res) => {
      let theme = indexjs.get(req);

      if (settings.api.client.allow.newusers == false) return four0four(req, res, theme);

      if (!req.query.email || !req.query.password || !req.query.username) return res.send("Missing information")
      if (await db.get(`user-${req.query.email}`)) return res.send("Already registered.");
      if (validator.validate(req.query.email) == false) return res.send("Invalid Email");

     
        let usernamehash = req.query.username + makenumber(4)
        
        usernamenew = String(usernamehash);

        const userinfo = {
            username: usernamenew, 
            id: req.query.email,
            password: req.query.password,
            discriminator: null,
            discord: false,
            type: "email"
        }
        const accountjson = await fetch(
            `${settings.pterodactyl.domain}/api/application/users`, {
              method: "post",
              headers: {
                'Content-Type': 'application/json',
                "Authorization": `Bearer ${settings.pterodactyl.key}`
              },
              body: JSON.stringify({
                username: usernamenew,
                email: req.query.email,
                first_name: usernamenew,
                last_name: "(credentials)",
                password: req.query.password
              })
            }
        );
        if (accountjson.status == 201) {
          const accountinfo = JSON.parse(await accountjson.text());
          await db.set(`users-${req.query.email}`, accountinfo.attributes.id);
        } else {
          let accountlistjson = await fetch(
            `${settings.pterodactyl.domain}/api/application/users?include=servers&filter[email]=${encodeURIComponent(req.query.email)}`, {
              method: "get",
              headers: {
                'Content-Type': 'application/json',
                "Authorization": `Bearer ${settings.pterodactyl.key}`
              }
            }
          );
          const accountlist = await accountlistjson.json();
          const user = accountlist.data.filter(acc => acc.attributes.email == req.query.email);
          if (user.length == 1) {
            let userid = user[0].attributes.id;
            await db.set(`users-${userinfo.id}`, userid);
          } else {
            return res.send("An error has occured when attempting to create your account.");
          };
        }
        let cacheaccount = await fetch(
          `${settings.pterodactyl.domain}/api/application/users/${await db.get(`users-${req.query.email}`)}?include=servers`,
          {
            method: "get",
            headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${settings.pterodactyl.key}` }
          }
        );
        if (await cacheaccount.statusText == "Not Found") return res.send("An error has occured while attempting to get your user information.");
        let cacheaccountinfo = JSON.parse(await cacheaccount.text());
        await db.set(`userinfo-${req.query.email}`, userinfo);
        await db.set(`username-${userinfo.id}`, usernamehash);
        await db.set('passwords-' + userinfo.id, req.query.password)

        let userdb = await db.get("userlist");
        userdb = userdb ? userdb : [];
        if (!userdb.includes(`${userinfo.id}`)) {
          userdb.push(`${userinfo.id}`);
          await db.set("userlist", userdb);
        }

        req.session.pterodactyl = cacheaccountinfo.attributes;
        req.session.userinfo = userinfo;

        return res.redirect("/dashboard");
    });

    function makenumber(length) {
      let result = '';
      let characters = '0123456789';
      let charactersLength = characters.length;
      for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
      }
      return result;
    }
  
    async function four0four(req, res, theme) {
      ejs.renderFile(
          `./themes/${theme.name}/${theme.settings.notfound}`, 
          await eval(indexjs.renderdataeval),
          null,
      function (err, str) {
          delete req.session.newaccount;
          if (err) {
              console.log(`[WEBSITE] An error has occured on path ${req._parsedUrl.pathname}:`);
              console.log(err);
              return res.send("An error has occured while attempting to load this page. Please contact an administrator to fix this.");
          };
          res.status(404);
          res.send(str);
      });
  }
}