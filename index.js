import express from "express";
import pg from "pg";
import env from "dotenv";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStratergy from "passport-google-oauth2";
import session from "express-session";


const app = express();
const saltRounds = 10;
env.config();

app.use(session({
    secret: "Topsecret",
    resave: false,
    saveUninitialized: false,
    cookie:{
        maxAge: 1000 * 60 * 60 * 24,  // this is for how long the cookie lives
    secure: false,                // set to true in production with HTTPS
  }
    

}))
app.use(passport.initialize());
app.use(passport.session())

const db = new pg.Client({
    host: process.env.PG_HOST,
    database:process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
    user: process.env.PG_USER
})
db.connect();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
    res.render("Home.ejs");
});

app.get("/register", async (req, res) => {

    res.render("register.ejs");

});

app.get("/imp", async (req, res) => {
    if (req.isAuthenticated()) {

        let imp = " "
        try {
            let result = await db.query("select motivation from users where email=$1", [req.user.email]);
            imp = result.rows[0].motivation
            res.render("imp.ejs", { imp: imp })
        } catch (err) {
            console.log(err);
        }
    } else {
        res.redirect("/login");
    }
});

app.get("/submit", (req, res) => {
    if (req.isAuthenticated()) {
        res.render("submit.ejs");
    } else {
        res.redirect("/");
    }
});

app.get("/login", async (req, res) => {
    
    res.render("login.ejs")
});

app.get("/auth/google",// this one gives the google login page when the user clickc this route 
    passport.authenticate("google", {
        scope: ["profile", "email"],
    })
// "google"	You're using the Google OAuth 2.0 strategy
// scope	What info you want from the user (permissions)

);
// After the user approves (clicks Allow) on Google's consent screen, Google redirects the user to the callbackURL which i did here boyys (like /auth/google/imp)


app.get("/auth/google/imp",//this is the call back route whecn the /auth/google called this is called see upside and later it googlestartegy call back funvtion runs here to login or register
    passport.authenticate("google", {
        successRedirect: "/imp",
        failureRedirect: "/login"
    })
);

//  /register route:
// You're manually doing the steps:

//1 Hash the password

//2 Save to DB

//3 Fetch the user

//4 Manually call req.login(user) → this creates the session


// req.login(user, function(err) {
//   if (err) { ... }
//   else { res.redirect("/secrets"); }
// });


// req.login() just starts a session—it doesn’t trigger any strategy.

//  No passport.authenticate('local') = No strategy triggered
// The Local Strategy is only meant to verify credentials, and it's only used during the login process, not during registration.
app.post("/register", async (req, res) => {
    let { username, email, password } = req.body;
    try {
        let checkuser = await db.query('select * from users where email=($1)', [email]);
        if (checkuser.rows.length > 0) {
            res.redirect("/login");

        } else {

            bcrypt.hash(password, saltRounds, async (err, hash) => {
                if (err) {
                    console.log("error hasing password");
                } else {
                    let result = await db.query('insert into users(username,email,password) values($1,$2,$3) returning*', [username, email, hash]);
                    console.log("The result:", result);
                    const user = result.rows[0];
                    req.login(user, (err) => {
                        console.log("success", user);
                        res.redirect("/imp");
                        // It uses  serializeUser() logic to determine what to store in the session.

                    // Usually just the user.id.
                        //this will scall the serilizer store in session 
                    })
                }
            });
        }
    } catch (err) {
        console.log(err);
    }
});
// req.logout() is a method added by Passport.js.

// It logs out the currently authenticated user by removing req.user and ending the session.

// It optionally takes a callback function to handle any errors that may happen during logout.
app.get("/logout",(req,res)=>{
  req.logout((err)=>{
    //error a call back function
    // if error return error
if(err) return next(err);
res.redirect('/');
  })
});

app.post("/submit", async (req, res) => {

    let motivation = req.body.secret;
    let useremail = req.user.email
    try {
        let ans = await db.query("update users set motivation=$1 where email=$2 ", [motivation, useremail]);
        res.redirect("/imp");
    } catch (err) {
        console.log(err);
    }
})


app.post("/login",
    passport.authenticate("local", {
        successRedirect: "/imp",
        failureRedirect: "/login"
    })
)

// passport.use("local", new Strategy( ... ))
// That means it's using default username field.
// But your form uses email, right?
//  So you should define:
// passport.use("local",
//   new Strategy(
//     { usernameField: "email" },
//     async function verify(email, password, cb) {
//       // same logic
//     }
//   )
// );
passport.use("local",
    new Strategy(
        { usernameField: "email" },
        async function verify(email, password, cb) {
            try {
                const result = await db.query("select * from users where email=$1", [email])
                if (result.rows.length > 0) {
                    const user = result.rows[0];
                    const storedHashedPassword = user.password;
                    bcrypt.compare(password, storedHashedPassword, (err, valid) => {
                        if (err) {
                            console.error("Error comparing passwords:", err);
                            return cb(err);
                        } else {
                            if (valid) {
                                return cb(null, user);
                            } else {
                                return cb(null, false);
                            }
                        }
                    })


                } else {
                    return cb("user not found");
                }

            } catch (err) {
                console.log(err);

            }
        })
);
passport.use("google", new GoogleStratergy(
    {
        clientID: process.env.client_id,
        clientSecret: process.env.client_secret,
        callbackURL: "http://localhost:3000/auth/google/imp",
        userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
    }, async (accesToken, refreshToken, Profile, cb) => {
        try {
            console.log(Profile);
            const result = await db.query("select * from users where email=$1", [Profile.email]);
            if (result.rows.length === 0) {
                const newuser = await db.query("insert into users (username,email,password) values ($1,$2,$3)", [Profile.displayName, Profile.email, "google"]);

                return cb(null, newuser.rows[0]);
            } else {
                return cb(null, result.rows[0]);
            }
        } catch (err) {
            return cb(err);
        }
    }

));
//serializer stores the user object when user gets Login
passport.serializeUser((user, cb) => {
    cb(null, user);
})
//deserializer fetches the object from session when we go to more pages which security is needed right...so it checks whether the id obj is in session or not or else it redirect to login page
passport.deserializeUser((user, cb) => {
    cb(null, user);
})
// these are They call a callback (cb) and pass data that Passport needs to:
// Store in session (during login)
// Retrieve and attach to req.user (on future requests)

// imp Fetches full user from DB
// Sets req.user


app.listen(3000, () => console.log("server running at 3000"))