server.js now initializes a database file if one is not present

# Hidden Truths Hub

## Overview

**Hidden Truths Hub** is a full-stack web application that allows users to explore, post, and discuss various conspiracy theories. Users can register and log in using their Google accounts, create posts, leave comments, and engage with others by liking posts. The project implements user authentication, database management, and provides a dynamic, interactive interface for user engagement.

## Features

- **User Authentication**: Secure Google OAuth2 authentication for user login and registration.
- **Post Creation and Management**: Users can create posts, view, edit, and delete them.
- **Commenting System**: Users can comment on posts and engage in discussions.
- **Likes**: Users can like posts to show their support.
- **Profile Customization**: View/delete posts.

## Technologies Used

### Frontend
- **HTML5 & CSS3**
- **JavaScript**
- **Handlebars.js**
  
### Backend
- **Node.js**
- **Express.js**
- **SQLite**
- **Google OAuth2**

## Getting Started

### Prerequisites

Ensure you have the following installed:

- **Node.js**: Version 16 or higher
- **SQLite**
- **Handlebars**

### Setup

1. **Clone the Repository.**
2. **Set up google oauth with the app https://developers.google.com/identity/protocols/oauth2**
3. **Create a .env file in the root directory and set variables `CLIENT_ID` and `CLIENT_SECRET` to the client id and secret you just made**
4. **Run `node server.js` to launch the app locally**
