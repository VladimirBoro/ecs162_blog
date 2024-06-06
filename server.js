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
// app.use('/partials', express.static(path.join(__dirname, 'views', 'partials'))); // Serve Handlebars partials from the "views/partials" directory

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
    const posts = await getPosts(sortType) || {};
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

// Add a new post and redirect to home
app.post('/posts', async (req, res) => {
    const user = await getCurrentUser(req) || {};
    await addPost(req.body.title, req.body.content, user);
    res.redirect('/');
});

// POST: a post like request
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

app.get('/comments/:id', async (req, res) => {
    const comments = await getPostComments(req.params.id);
    // send back post comments as a response
    res.json(comments);
});

// leave a commnent on a post, POST request comes from home page
app.post('/comments/:id/:page', async (req, res) => {
    await addComment(req);
    // redirect to either home or profile page
    let pagePath;
    if (req.params.page === 'home') {
        pagePath = '/';
    }
    else {
        pagePath = '/profile';
    }
    res.redirect(pagePath);
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
    await deletePost(req);
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
    const user = await getCurrentUser(req);
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

// connect to our db
async function connectToDb() {
    db = await sqlite.open({ filename: DB_FILE_NAME, driver: sqlite3.Database });

    const usersTableExists = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='users';`);
    const postsTableExists = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='posts';`);
    const likesTableExists = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='likes';`);
    const commentsTableExists = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='comments';`);

    // if we have no tables then create the db
    if (!usersTableExists && !postsTableExists && !likesTableExists && !commentsTableExists) {
        initializeDB();
    }
}

// initialize db with sample data
async function initializeDB() {
    // create our necessary tables
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            hashedGoogleId TEXT NOT NULL UNIQUE,
            avatar_url TEXT,
            memberSince DATETIME NOT NULL
        );

        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            username TEXT NOT NULL,
            timestamp DATETIME NOT NULL,
            likes INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            postId INTEGER NOT NULL,
            userId INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            postId INTEGER NOT NULL,
            userId INTEGER NOT NULL,
            username TEXT NOT NULL,
            comment TEXT NOT NULL,
            timestamp DATETIME NOT NULL
        );
    `);

    // Create sample data to fill our tables with
    const users = [
        { username: 'MysticSeeker', hashedGoogleId: 'hashedGoogleId1', avatar_url: './imgs/MysticSeeker.png', memberSince: '2024-01-01 12:00:00' },
        { username: 'QuantumDreamer', hashedGoogleId: 'hashedGoogleId2', avatar_url: './imgs/QuantumDreamer.png', memberSince: '2024-01-02 12:00:00' },
        { username: 'DiscipleOfYakub', hashedGoogleId: 'hashedGoogleId3', avatar_url: './imgs/DiscipleOfYakub.png', memberSince: '2024-02-02 12:00:00' },
        { username: 'EnigmaHunter', hashedGoogleId: 'hashedGoogleId4', avatar_url: './imgs/EnigmaHunter.png', memberSince: '2024-03-02 12:00:00' },
    ];

    const posts = [
        { title: 'The Moon Landing Hoax', content: 'I believe the moon landing was faked. Here\'s why...', username: 'MysticSeeker', timestamp: '2024-01-01 12:30:00', likes: 0 },
        { title: 'Flat Earth Theory', content: 'The Earth is not round. Here\'s the evidence...', username: 'QuantumDreamer', timestamp: '2024-01-02 12:30:00', likes: 1 },
        { title: 'Secret Societies Control the World', content: 'There are powerful secret societies pulling the strings. Let me explain...', username: 'DiscipleOfYakub', timestamp: '2024-02-02 13:00:00', likes: 0 },
        { title: 'The Illuminati Agenda', content: 'The Illuminati is real and they have a hidden agenda...', username: 'EnigmaHunter', timestamp: '2024-03-02 14:00:00', likes: 2 },
        {
            title: 'BEES???',
            content: 'In recent years, the alarming decline in bee populations worldwide has become a pressing concern for scientists and environmentalists alike. Known as Colony Collapse Disorder (CCD), this phenomenon has seen worker bees vanish from their hives, leaving behind the queen and immature bees. While many attribute this crisis to pesticide use, habitat loss, and disease, a growing faction of conspiracy theorists believes there’s a more sinister explanation: a deliberate cover-up.',
            username: 'DiscipleOfYakub',
            timestamp: '2024-06-4 at 16:59',
            likes: 3
        }
    ];

    const comments = [
        { postId: '1', userId: '2', username: 'QuantumDreamer', comment: 'bro u r so dum!', timestamp: '6pm' },
        {
            postId: '5',
            userId: '4',
            username: 'EnigmaHunter',
            comment: 'u r wrong and a dummy!',
            timestamp: '2024-06-4 at 16:59'
        },
        {
            postId: '5',
            userId: '1',
            username: 'MysticSeeker',
            comment: 'LOL so true!!!',
            timestamp: '2024-06-4 at 16:59'
        }
    ];

    // using a different method of filling tables trying to avoid strange bug where order inserted is messed up
    for (const user of users) {
        await db.run(
            'INSERT INTO users (username, hashedGoogleId, avatar_url, memberSince) VALUES (?, ?, ?, ?)',
            [user.username, user.hashedGoogleId, user.avatar_url, user.memberSince]
        );
    }

    for (const post of posts) {
        await db.run(
            'INSERT INTO posts (title, content, username, timestamp, likes) VALUES (?, ?, ?, ?, ?)',
            [post.title, post.content, post.username, post.timestamp, post.likes]
        );
    }

    for (const comment of comments) {
        await db.run(
            'INSERT INTO comments (postId, userId, username, comment, timestamp) VALUES (?, ?, ?, ?, ?)',
            [comment.postId, comment.userId, comment.username, comment.comment, comment.timestamp]
        );
    }
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// sha-256 hashing for user google id
function hashGoogleId(userId) {
    return crypto.createHash('sha256').update(userId).digest('hex');
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
    // delete user form users table
    const user = await findUserByUsername(username);

    // delete all the comments the user made
    await db.run(
        'DELETE FROM comments WHERE userId = ?',
        [user.id]
    )

    await db.run(
        'DELETE FROM users WHERE username = ?',
        [username]
    );

    // get all user posts
    const userPosts = await db.all(
        'SELECT * FROM posts WHERE username = ?',
        [username]
    );

    // delete post from posts
    await db.run(
        'DELETE FROM posts WHERE username = ?',
        [username]
    );

    // delete all comments from userPosts
    userPosts.forEach(async post => {
        const postId = post.id;
        await db.run(
            'DELETE FROM comments WHERE postId = ?',
            [postId]
        );
    });
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
    const userPosts = await getUserPosts(user, sortType);
    res.render('profile', { user, userPosts, sortType });
}

async function isPostLikedByCurrentUser(userId, postId) {
    const likePair = await db.get(
        `SELECT * FROM likes WHERE postId = ? AND userId = ?`, 
        [postId, userId]
    );

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

async function getPostComments(postId) {
    comments = await db.all(`SELECT * FROM comments WHERE postId = ? ORDER BY id DESC`, [postId]);
    return comments;
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

async function deletePost(req) {
    const postId = req.params.id;

    // delete post from 'posts' table
    await db.run(
        'DELETE FROM posts WHERE id = ?',
        [postId]
    );

    // delete comments associated to post
    await db.run(
        'DELETE FROM comments WHERE postId = ?',
        [postId]
    );

    await db.run(
        'DELETE FROM likes WHERE postId = ?',
        [postId]
    );
}

async function addComment(req) {
    const postId = req.params.id;
    const user = await getCurrentUser(req);
    const userId = user.id;
    const username = user.username;
    const comment = req.body.comment;
    const timestamp = getTime();

    await db.run(
        'INSERT INTO comments (postId, userId, username, comment, timestamp) VALUES (?, ?, ?, ?, ?)',
        [postId, userId, username, comment, timestamp]
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