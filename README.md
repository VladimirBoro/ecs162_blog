server.js now initializes a database file if one is not present

# Hidden Truths Hub

## Overview

**Hidden Truths Hub** is a full-stack web application that allows users to explore, post, and discuss various conspiracy theories. Users can register and log in using their Google accounts, create posts, leave comments, and engage with others by liking posts. The project implements user authentication, database management, and provides a dynamic, interactive interface for user engagement.

## Features

- **User Authentication**: Secure Google OAuth2 authentication for user login and registration.
- **Post Creation and Management**: Users can create posts, view, edit, and delete them.
- **Commenting System**: Users can comment on posts and engage in discussions.
- **Likes**: Users can like posts to show their support.
- **Profile Customization**: Users can set a profile picture and view their post history.

## Technologies Used

### Frontend
- **HTML5 & CSS3**: For building responsive and accessible user interfaces.
- **JavaScript**: Handles dynamic behaviors and interactions on the client-side.
- **Handlebars.js**: Used for server-side rendering of templates.
  
### Backend
- **Node.js**: The server-side runtime for handling requests.
- **Express.js**: Web framework for creating RESTful APIs and managing routing.
- **SQLite**: Lightweight relational database to store user, post, comment, and like data.
- **Google OAuth2**: For secure authentication and user account management.

## Getting Started

### Prerequisites

Ensure you have the following installed:

- **Node.js**: Version 16 or higher
- **SQLite**
- **Handlebars**

### Setup

1. **Clone the Repository.**
2. **In the root directory run npm install.**
3. **Run npm start to launch the app locally**
