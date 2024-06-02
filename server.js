const express = require('express');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const canvas = require('canvas');
const fs = require('fs');
const path = require('path');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const passport = require('passport');
const crypto = require('crypto');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const dotenv = require('dotenv');
const { get } = require('emoji-api');

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Configuration and Setup
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

dotenv.config();

const app =             express();
const PORT =            process.env.PORT || 3000;
const AVATAR_FONT =     process.env.AVATAR_FONT || '3em sans serif';
const DB_FILE_NAME =    process.env.DB_FILE_NAME || 'hiddenTruths.db';
const CLIENT_ID =       process.env.CLIENT_ID || '';
const CLIENT_SECRET =   process.env.CLIENT_SECRET || '';

const DEFAULT_SORT = 'newest';

let db;
let sortType = DEFAULT_SORT; // global for type of sorting to display posts with

/*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    Handlebars Helpers

    Handlebars helpers are custom functions that can be used within the templates 
    to perform specific tasks. They enhance the functionality of templates and 
    help simplify data manipulation directly within the view files.

    In this project, two helpers are provided:
    
    1. toLowerCase:
       - Converts a given string to lowercase.
       - Usage example: {{toLowerCase 'SAMPLE STRING'}} -> 'sample string'

    2. ifCond:
       - Compares two values for equality and returns a block of content based on 
         the comparison result.
       - Usage example: 
            {{#ifCond value1 value2}}
                <!-- Content if value1 equals value2 -->
            {{else}}
                <!-- Content if value1 does not equal value2 -->
            {{/ifCond}}
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
*/

// Set up Handlebars view engine with custom helpers
//
app.engine(
    'handlebars',
    expressHandlebars.engine({
        helpers: {
            toLowerCase: function (str) {
                return str.toLowerCase();
            },
            ifCond: function (v1, v2, options) {
                if (v1 === v2) {
                    return options.fn(this);
                }
                return options.inverse(this);
            },
            eq: function (a, b) {
                return a === b;
            },
        },
    })
);

app.set('view engine', 'handlebars');
app.set('views', './views');

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Middleware
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Configure passport
passport.use(new GoogleStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: `http://localhost:${PORT}/auth/google/callback`
}, (token, tokenSecret, profile, done) => {
    return done(null, profile);
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

app.use(
    session({
        secret: 'oneringtorulethemall',     // Secret key to sign the session ID cookie
        resave: false,                      // Don't save session if unmodified
        saveUninitialized: false,           // Don't create session until something stored
        cookie: { secure: false },          // True if using https. Set to false for development without https
    })
);

// Replace any of these variables below with constants for your application. These variables
// should be used in your template files. 
// 
app.use((req, res, next) => {
    res.locals.appName = 'Hidden Truths Hub';
    res.locals.copyrightYear = 2024;
    res.locals.postNeoType = 'Truth';
    res.locals.loggedIn = req.session.loggedIn || false;
    res.locals.userId = req.session.userId || '';
    next();
});

app.use(express.static('views'));                  // Serve static files
app.use(express.urlencoded({ extended: true }));    // Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.json());                            // Parse JSON bodies (as sent by API clients)

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
app.use(passport.initialize());
app.use(passport.session());

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile'] })
);

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }),
    async (req, res) => {
        // successful authentication, attempt to login.
        loginUser(req, res);
    }
);

// Home route: render home view with posts and user
// We pass the posts and user variables into the home
// template
//
app.get('/', async (req, res) => {
    const posts = await getPosts(sortType);
    const user = await getCurrentUser(req) || {};
    res.render('home', { posts, user, sortType });
});

// Register GET route is used for error response from registration
//
app.get('/register', (req, res) => {
    res.render('registerUsername', { regError: req.query.error });
});

// Login route GET route is used for error response from login
//
app.get('/login', (req, res) => {
    res.render('loginRegister', { loginError: req.query.error });
});

// Error route: render error page
//
app.get('/error', (req, res) => {
    res.render('error');
});

// Additional routes that you must implement

app.post('/posts', async (req, res) => {
    // Add a new post and redirect to home
    const user = await getCurrentUser(req) || {};
    await addPost(req.body.title, req.body.content, user);
    res.redirect('/');
});
app.post('/like/:id', async (req, res) => {
    // only logged in user may like a post
    if (req.session.loggedIn) {
        const postId = req.params.id;
        const userId = await getCurrentUser(req);
        const alreadyLiked = await isPostLikedByCurrentUser(userId.id, postId);

        // update like based on whether user has like it already or not
        await updatePostLikes(alreadyLiked, userId, postId);
        res.redirect('/');
    }
});
app.get('/profile', isAuthenticated, (req, res) => {
    renderProfile(req, res);
});
app.get('/avatar/:username', (req, res) => {
    // Serve the avatar image for the user
    handleAvatar(req, res);
});
app.post('/register', (req, res) => {
    registerUser(req, res);
});
app.post('/login', (req, res) => {
    loginUser(req, res);
});
app.get('/logout', (req, res) => {
    logoutUser(req, res);
});
app.get('/googleLogout', (req, res) => {
    req.session.destroy();
    // manually do locals cause main layout thinks it is logged in still
    res.locals.loggedIn = false;
    res.locals.userId = '';
    res.render('googleLogout');
});
app.post('/delete/:id', isAuthenticated, async (req, res) => {
    await deletePost(req, res);
    res.redirect('/');
});
app.post('/sortPosts/:type', (req, res) => {
    sortType = req.params.type;
    res.redirect('/');
});
app.post('/sortUsrPosts/:type', (req, res) => {
    sortType = req.params.type;
    res.redirect('/profile');
});
app.get('/deleteUser', async (req, res) => {
    const user = await getCurrentUser(req) || {};
    res.render('deleteUser', { user });
});
app.post('/deleteUser', async (req, res) => {
    // get and remove current user from db
    console.log("deleting user now...")
    const user = await getCurrentUser(req);
    console.log(user.username);
    await removeUser(user.username);

    // destroy session and redirect back home
    req.session.destroy();
    res.redirect('/');
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.listen(PORT, () => {
    // connect to the db upon server activation
    connectToDb().catch(err => {
        console.error('Error initializing database:', err);
    });

    console.log(`Server is running on http://localhost:${PORT}`);
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// sha-256 hashing for user google id
function hashGoogleId(userId) {
    return crypto.createHash('sha256').update(userId).digest('hex');
}

// initialize db, async + await so initialization happens first
async function connectToDb() {
    db = await sqlite.open({ filename: DB_FILE_NAME, driver: sqlite3.Database });
}

// Function to find a user by username
async function findUserByUsername(username) {
    const users = await db.all('SELECT * FROM users');

    for(let i = 0; i < users.length; i++) {
        if (users[i].username == username) {
            return users[i];
        }
    }
    
    return undefined;
}

// Function to find a user by user ID
async function findUserById(userId) {
    const users = await db.all('SELECT * FROM users');
    for (let i = 0; i < users.length; i++) {
        // types not the same so do double = not triple
        if (users[i].id == userId) {
            return users[i];
        }
    }
    
    return undefined;
}

// Function to find a user by user ID
async function findUserByGoogleId(id) {
    const users = await db.all('SELECT * FROM users');
    for (let i = 0; i < users.length; i++) {
        if (users[i].hashedGoogleId === id) {
            return users[i];
        }
    }
    
    return undefined;
}

function getTime() {
    const date = new Date();
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2,'0');
    const day = String(date.getDate());
    const hour = String(date.getHours() + 1).padStart(2,'0')
    const minute = String(date.getMinutes() + 1).padStart(2,'0')
    
    // YYYY-MM-DD HR:MIN timestamp format
    return `${year}-${month}-${day} at ${hour}:${minute}`;
}

/*
    removes the user from the users table
    and removes said users posts from the posts table
*/
async function removeUser(username) {
    await db.run(
        'DELETE FROM users WHERE username = ?',
        [username]
    );
    await db.run(
        'DELETE FROM posts WHERE username = ?',
        [username]
    );
}

// Function to add a new user
async function addUser(username, hashedGoogleId) {
    const avatar_url = generateAvatar(username); // replace with user pic generation
    const timestamp = getTime();
    
    await db.run(
        'INSERT INTO users (username, hashedGoogleId, avatar_url, memberSince) VALUES (?, ?, ?, ?)',
        [username, hashedGoogleId, avatar_url, timestamp]
    );
}

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Function to register a user
async function registerUser(req, res) {
    const username = req.body.register;
    let user = await findUserByUsername(username);

    if (user) {
        // error msg
        res.redirect('/register?error=Username already exists');
    }
    else {
        // add user to database
        await addUser(username, req.session.googleId);
        // now log in this new user
        user = await findUserByUsername(username);
        req.session.userId = user.id;
        req.session.loggedIn = true;
        res.redirect('/');
    }
}

// Function to login a user
async function loginUser(req, res) {
    const hashedGoogleId = hashGoogleId(req.user.id);
    const user = await findUserByGoogleId(hashedGoogleId);
    
    if (user) {
        // log in success
        req.session.userId = user.id;
        req.session.loggedIn = true;
        res.redirect('/');
    }
    else {
        // user not found, prompt them to register new user
        // encode the hashed id for security!
        req.session.googleId = hashedGoogleId;
        res.redirect('/register');
    }
}

// Function to logout a user
function logoutUser(req, res) {
    // Destroy session and redirect appropriately
    req.session.destroy();
    res.redirect('/googleLogout');
}

// get all posts from a specific user
async function getUserPosts(user, type) {
    let retrievedPosts = [];

    if (type === 'newest') {
        retrievedPosts = await db.all('SELECT * FROM posts WHERE username = ? ORDER BY id DESC ', [user.username]);
    }
    else if (type === 'oldest') {
        retrievedPosts = await db.all('SELECT * FROM posts WHERE username = ? ORDER BY id ASC', [user.username]);
    }
    // most liked
    else {
        retrievedPosts = await db.all('SELECT * FROM posts WHERE username = ? ORDER BY likes DESC', [user.username]);
    }

    return retrievedPosts;
}

// Function to render the profile page
async function renderProfile(req, res) {
    const user = await getCurrentUser(req) || {};
    userPosts = await getUserPosts(user, sortType);
    res.render('profile', { user, userPosts, sortType });
}

async function isPostLikedByCurrentUser(userId, postId) {
    const likePair = await db.get(
        `SELECT * FROM likes WHERE postId = ? AND userId = ?`, 
        [postId, userId]
    );
    console.log(likePair);
    if (likePair) {
        return true;
    }

    return false;
}

// Function to update post likes
async function updatePostLikes(alreadyLiked, userId, postId) {
    // get post associated with postId
    let post = await db.get(
        'SELECT * FROM posts WHERE id = ?',
        [postId]
    );
    
    let change = alreadyLiked ? -1 : 1;
    // console.log("liked?", alreadyLiked, change, postId, userId.id);

    // update post likes by -/+ one
    await db.run(
        'UPDATE posts SET likes = ? WHERE id = ?',
        [post.likes + change, postId]
        );
        
    // removed our like from post so remove info from likes table
    if (change < 0) {
        await db.run('DELETE FROM likes WHERE postId = ? AND userId = ?',
        [postId, userId.id])
    }
    // added a like so insert info into likes table
    else {
        await db.run('INSERT INTO likes (postId, userId) VALUES (?, ?)',
        [postId, userId.id])

    }

    return false;
}

// Function to handle avatar generation and serving said avatar
async function handleAvatar(req, res) {
    const username = req.params.username;
    const user = await findUserByUsername(username);

    const avatarPath = path.join(__dirname + "/views/", user.avatar_url);
    res.sendFile(avatarPath);
}

// Function to get the current user from session
async function getCurrentUser(req) {
    const user = await findUserById(req.session.userId);
    return user;
}

// Function to get all posts, sorted by latest first
async function getPosts(type) {
    let retrievedPosts = [];

    if (type === 'newest') {
        retrievedPosts = await db.all('SELECT * FROM posts ORDER BY id DESC');
    }
    else if (type === 'oldest') {
        retrievedPosts = await db.all('SELECT * FROM posts ORDER BY id ASC');
    }
    // most liked
    else {
        retrievedPosts = await db.all('SELECT * FROM posts ORDER BY likes DESC');
    }

    return retrievedPosts;
}

// Function to add a new post
async function addPost(title, content, user) {
    const username = user.username;
    const timestamp = getTime();
    let likes = 0;

    await db.run(
        'INSERT INTO posts (title, content, username, timestamp, likes) VALUES (?, ?, ?, ?, ?)',
        [title, content, username, timestamp, likes]
    );
}

async function deletePost(req, res) {
    const postId = req.params.id;

    await db.run(
        'DELETE FROM posts WHERE id = ?',
        [postId]
    );
}

function getRandomDarkColor() {
    const r = Math.floor(Math.random() * 80);
    const g = Math.floor(Math.random() * 80);
    const b = Math.floor(Math.random() * 80);
    return `rgb(${r}, ${g}, ${b})`;
}

// Function to generate a random light color
function getRandomLightColor() {
    const r = Math.floor(Math.random() * 128) + 128;
    const g = Math.floor(Math.random() * 128) + 128;
    const b = Math.floor(Math.random() * 128) + 128;
    return `rgb(${r}, ${g}, ${b})`;
}

// Function to generate an image avatarß
function generateAvatar(username, width = 100, height = 100) {
    // avatar canvas to draw on
    const avatar = canvas.createCanvas(width, height);

    // fill canvas background with a random dark color
    const ctx = avatar.getContext("2d");
    ctx.beginPath();
    ctx.fillStyle = getRandomDarkColor();
    ctx.fillRect(0,0,width,height);

    // write a `?` with a random light color and rotation
    ctx.font = AVATAR_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = getRandomLightColor();
    ctx.translate(width / 2, height / 2);
    const randomAngle = Math.floor(Math.random() * 359) + 1;
    ctx.rotate(randomAngle);
    ctx.fillText("?", 0, 0);

    // Save img to imgs folder and then return proper path for user avatar url
    const buffer = avatar.toBuffer('image/png');
    const filePath = process.cwd() + `/views/imgs/${username}.png`;
    fs.writeFileSync(filePath, buffer);
    return `./imgs/${username}.png`;
}