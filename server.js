const express = require('express');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const canvas = require('canvas');
const fs = require('fs');
const path = require('path');


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Configuration and Setup
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const app = express();
const PORT = 3000;
const AVATAR_FONT = "3em sans serif";
// const API_URL = "https://emoji-api.com/";
// const API_KEY = "access_key=c4373b2d774bf7f8476789d9fb88dd3efe5c455e";

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

// Home route: render home view with posts and user
// We pass the posts and user variables into the home
// template
//
app.get('/', (req, res) => {
    const posts = getPosts();
    const user = getCurrentUser(req) || {};
    res.render('home', { posts, user });
});

// Register GET route is used for error response from registration
//
app.get('/register', (req, res) => {
    res.render('loginRegister', { regError: req.query.error });
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

app.post('/posts', (req, res) => {
    // TODO: Add a new post and redirect to home
    const user = getCurrentUser(req) || {};
    addPost(req.body.title, req.body.content, user);
    res.redirect('/');
});
app.post('/like/:id', (req, res) => {
    // TODO: Update post likes
    if (updatePostLikes(req)) {
        res.redirect('/');
    }

});
app.get('/profile', isAuthenticated, (req, res) => {
    // TODO: Render profile page
    renderProfile(req, res);
});
app.get('/avatar/:username', (req, res) => {
    // TODO: Serve the avatar image for the user
    handleAvatar(req, res);
    
});
app.post('/register', (req, res) => {
    // --TODO: Register a new user
    registerUser(req, res);
});
app.post('/login', (req, res) => {
    // TODO: Login a user
    loginUser(req, res);
    
});
app.get('/logout', (req, res) => {
    // TODO: Logout the user
    logoutUser(req, res);
});
app.post('/delete/:id', isAuthenticated, (req, res) => {
    // TODO: Delete a post if the current user is the owner
    deletePost(req, res);
    res.redirect('/');
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Example data for posts and users
let users = [
    {
        id: 1,
        username: 'MysticSeeker',
        avatar_url: './imgs/MysticSeeker.png',
        memberSince: '2024-05-01 10:00',
        posts: [
            {
                id: 1,
                title: 'The Government\'s Secret Mind Control Experiment Revealed!',
                content: 'I\'ve uncovered shocking evidence that the government has been conducting a secret mind control experiment for decades. Stay woke!',
                username: 'MysticSeeker',
                timestamp: '2024-05-02 08:30',
                likers: new Set(),
                likes: 0
            }
        ]
    },
    {
        id: 2,
        username: 'QuantumDreamer',
        avatar_url: './imgs/QuantumDreamer.png',
        memberSince: '2024-05-01 11:30',
        posts: [
            {
                id: 2,
                title: 'Time Travel: I\'ve Discovered the Truth Behind Temporal Anomalies',
                content: 'Through my experiments with quantum mechanics, I\'ve unlocked the mysteries of time travel. Prepare to have your minds blown!',
                username: 'QuantumDreamer',
                timestamp: '2024-05-02 09:45',
                likers: new Set(),
                likes: 0
            }
        ]
    },
    {
        id: 3,
        username: 'CosmicConspirator',
        avatar_url: './imgs/CosmicConspirator.png',
        memberSince: '2024-05-01 12:15',
        posts: [
            {
                id: 3,
                title: 'Aliens Among Us: My Encounter with Extraterrestrial Beings',
                content: 'Last night, I had a close encounter with beings from another planet. They revealed to me the truth about our existence. Brace yourselves!',
                username: 'CosmicConspirator',
                timestamp: '2024-05-02 11:00',
                likers: new Set(),
                likes: 0
            }
        ]
    },
    {
        id: 4,
        username: 'EnigmaHunter',
        avatar_url: './imgs/EnigmaHunter.png',
        memberSince: '2024-05-01 13:45',
        posts: [
            {
                id: 4,
                title: 'The Moon Landing Hoax: Exposing NASA\'s Biggest Lie',
                content: 'After years of research, I can confirm that the moon landing was staged. NASA has been deceiving us all along.',
                username: 'EnigmaHunter',
                timestamp: '2024-05-02 13:00',
                likers: new Set(),
                likes: 0
            }
        ]
    },
    {
        id: 5,
        username: 'DiscipleOfYakub',
        avatar_url: './imgs/DiscipleOfYakub.png',
        memberSince: '2024-05-01 14:20',
        posts: [
            {
                id: 5,
                title: 'The Agartha Conspiracy: Journey to the Inner Earth',
                content: 'For centuries, there have been tales of a hidden world beneath our feet - Agartha. Join me as I delve into the mysteries of the Hollow Earth and its enigmatic inhabitants.',
                username: 'DiscipleOfYakub',
                timestamp: '2024-05-02 14:30',
                likers: new Set(),
                likes: 0
            }
        ]
    }
];
let posts = [
    {
        id: 1,
        title: 'The Government\'s Secret Mind Control Experiment Revealed!',
        content: 'I\'ve uncovered shocking evidence that the government has been conducting a secret mind control experiment for decades. Stay woke!',
        username: 'MysticSeeker',
        timestamp: '2024-05-02 08:30',
        likers: new Set(),
        likes: 0
    },
    {
        id: 2,
        title: 'Time Travel: I\'ve Discovered the Truth Behind Temporal Anomalies',
        content: 'Through my experiments with quantum mechanics, I\'ve unlocked the mysteries of time travel. Prepare to have your minds blown!',
        username: 'QuantumDreamer',
        timestamp: '2024-05-02 09:45',
        likers: new Set(),
        likes: 0
    },
    {
        id: 3,
        title: 'Aliens Among Us: My Encounter with Extraterrestrial Beings',
        content: 'Last night, I had a close encounter with beings from another planet. They revealed to me the truth about our existence. Brace yourselves!',
        username: 'CosmicConspirator',
        timestamp: '2024-05-02 11:00',
        likers: new Set(),
        likes: 0
    },
    {
        id: 4,
        title: 'The Moon Landing Hoax: Exposing NASA\'s Biggest Lie',
        content: 'After years of research, I can confirm that the moon landing was staged. NASA has been deceiving us all along.',
        username: 'EnigmaHunter',
        timestamp: '2024-05-02 13:00',
        likers: new Set(),
        likes: 0
    },
    {
        id: 5,
        title: 'The Agartha Conspiracy: Journey to the Inner Earth',
        content: 'For centuries, there have been tales of a hidden world beneath our feet - Agartha. Join me as I delve into the mysteries of the Hollow Earth and its enigmatic inhabitants.',
        username: 'DiscipleOfYakub',
        timestamp: '2024-05-02 14:30',
        likers: new Set(),
        likes: 0
    }
];

// Function to find a user by username
function findUserByUsername(username) {
    // TODO: Return user object if found, otherwise return undefined
    for (let i = 0; i < users.length; i++) {
        if (users[i].username === username) {
            return users[i];
        }
    }
    
    return undefined;
}

// Function to find a user by user ID
function findUserById(userId) {
    // TODO: Return user object if found, otherwise return undefined
    for (let i = 0; i < users.length; i++) {
        if (users[i].id === userId) {
            return users[i];
        }
    }
    
    return undefined;
}

function getTime() {
    const date = new Date();
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2,'0');
    const day = String(date.getDate());//.padStart(2,'0');
    const hour = String(date.getHours() + 1).padStart(2,'0')
    const minute = String(date.getMinutes() + 1).padStart(2,'0')
    
    // YYYY-MM-DD HR:MIN timestamp format
    return `${year}-${month}-${day} at ${hour}:${minute}`;
}

// Function to add a new user
function addUser(username) {
    // TODO: Create a new user object and add to users array
    const _id = users.length + 1;
    const _username = username;
    const _avatar_url = generateAvatar(_username); // replace with user pic generation
    const _timestamp = getTime();
    
    const newUser = {
        id: _id,
        username: _username,
        avatar_url: _avatar_url,
        memberSince: _timestamp,
        posts: []
    }
    
    users.push(newUser);
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
function registerUser(req, res) {
    // TODO: Register a new user and redirect appropriately
    const username = req.body.register;
    const user = findUserByUsername(username);
    
    if(user == undefined) {
        addUser(username);
        res.redirect('/login');
    }
    else {
        // error ting
        res.redirect('/register?error=Username already exists');
    }
}

// Function to login a user
function loginUser(req, res) {
    // TODO: Login a user and redirect appropriately
    const username = req.body.login;
    const user = findUserByUsername(username);
    
    if (user) {
        // log in success
        req.session.userId = user.id;
        req.session.loggedIn = true;
        res.redirect('/');
    }
    else {
        // error ting
        res.redirect(`/login?error=Username \'${username}\' not found`);
    }
}

// Function to logout a user
function logoutUser(req, res) {
    // TODO: Destroy session and redirect appropriately
    req.session.destroy();
    res.redirect('/');
}

function getUserPosts(user) {
    // only fill up posts once
    if (user.posts.length != 0) {
        return;
    }

    for (let i = 0; i < posts.length; i++) {
        if (posts[i].username === user.username) {
            user.posts.push(posts[i]);
        }
    }
}

// Function to render the profile page
function renderProfile(req, res) {
    // TODO: Fetch user posts and render the profile page
    const user = getCurrentUser(req) || {};
    getUserPosts(user);

    res.render('profile', { user });
}

// Function to update post likes
function updatePostLikes(req) {
    // TODO: Increment post likes if conditions are met
    if (req.session.loggedIn) {
        const user = findUserById(req.session.userId);
        const postId = req.params.id;
        let post = findPostById(postId);
        
        const oldSize = posts[post].likers.size;
        posts[post].likers.add(user.id);
        posts[post].likes = posts[post].likers.size;

        // if this like successful then return true
        if (oldSize < posts[post].likes) {
            return true;
        }
    }

    return false;
}

// Function to handle avatar generation and serving
function handleAvatar(req, res) {
    // TODO: Generate and serve the user's avatar image
    const username = req.params.username;
    const user = findUserByUsername(username);

    const avatarPath = path.join(__dirname + "/views/", user.avatar_url);
    res.sendFile(avatarPath);
}

// Function to get the current user from session
function getCurrentUser(req) {
    // TODO: Return the user object if the session user ID matches
    const user = findUserById(req.session.userId);

    if (user) {
        return user;
    }

    return undefined;
}

// return post from posts by id
function findPostById(id) {
    for (let i = 0; i < posts.length; i++) {
        // match!
        if (posts[i].id == id) {
            return i;
        }
    }

    return undefined;
}

// return post from posts by id
function findUserPostById(user, id) {
    for (let i = 0; i < user.posts.length; i++) {
        // match!
        if (user.posts[i].id == id) {
            return i;
        }
    }

    return undefined;
}

function generatePostId() {

    // we will compare the real id values to these to determine what is missing
    let ids = [];
    for (let i = 0; i < posts.length; i++) {
        ids.push(i + 1);
    }

    for (let i = 0; i < posts.length; i++) {
        for (let j = 0; j < ids.length; j++) {
            if (posts[i].id == ids[j]) {
                ids.splice(j, 1);
                break;
            }
        }
    }
    
    if (ids.length == 0) {
        return posts.length + 1;
    }

    return ids[0];
}

// Function to get all posts, sorted by latest first
function getPosts() {
    return posts.slice().reverse();
}

// Function to add a new post
function addPost(title, content, user) {
    // TODO: Create a new post object and add to posts array
    const id = generatePostId();

    const postTitle = title;
    const postContent = content;
    const username = user.username;
    const timestamp = getTime();
    let likers = new Set();
    let likes = 0;

    const post = {
        id: id,
        title: postTitle,
        content: postContent,
        username: username,
        timestamp: timestamp,
        likers: likers,
        likes: likes
    };

    posts.push(post);
    user.posts.push(post);
}

function deletePost(req, res) {
    let user = getCurrentUser(req);   // current user
    const postId = req.params.id;       // specific post from user
    
    // delete post from posts
    post = findPostById(postId);
    posts.splice(post, 1);

    //delete post from user.posts
    userPost = findUserPostById(user, postId);
    user.posts.splice(userPost, 1);
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
    // TODO: Generate an avatar image with a letter
    // Steps:
    // 1. Choose a color scheme based on the letter
    // 2. Create a canvas with the specified width and height
    // 3. Draw the background color
    // 4. Draw the letter in the center
    // 5. Return the avatar as a PNG buffer
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
    ctx.rotate(randomAngle * Math.PI / 180);
    ctx.fillText("?", 0, 0);

    // Save img to imgs folder and then return proper path for user avatar url
    const buffer = avatar.toBuffer('image/png');
    const filePath = process.cwd() + `/views/imgs/${username}.png`;
    fs.writeFileSync(filePath, buffer);
    return `./imgs/${username}.png`;
}