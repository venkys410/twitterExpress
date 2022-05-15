const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

let db = null;
const dbPath = path.join(__dirname, "twitterClone.db");

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error : ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

//API 1 Register

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPwd = await bcrypt.hash(password, 10);
  const userQuery = `SELECT * FROM user WHERE username LIKE "${username}"`;
  const dbUser = await db.get(userQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const userRegisterQuery = `
            INSERT INTO user
            (name,username,password,gender)
            VALUES
            ('${name}','${username}',"${hashedPwd}",'${gender}');
          `;
      await db.run(userRegisterQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// API 2 Login

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserQuery = `SELECT * FROM user WHERE username LIKE "${username}"`;
  const dbUser = await db.get(checkUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const validatePwd = await bcrypt.compare(password, dbUser.password);
    if (validatePwd) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "Chiiti410");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// middleware

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeaders = request.headers["authorization"];
  if (authHeaders !== undefined) {
    jwtToken = authHeaders.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "Chiiti410", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API 3

const convertDbToResponse = (data) => {
  return {
    username: data.username,
    tweet: data.tweet,
    dateTime: data.dateTime,
  };
};

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  //   console.log(username);
  const getUserId = `SELECT user_id FROM user WHERE username LIKE "${username}"`;
  const userData = await db.get(getUserId);
  const userId = userData.user_id;

  const getTweetsFeddQuery = `
        SELECT user.username AS username ,tweet.tweet AS tweet,tweet.date_time AS dateTime
        FROM follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id INNER JOIN 
        user ON tweet.user_id = user.user_id
        WHERE follower.follower_user_id = ${userId}
        ORDER BY tweet.date_time DESC
        LIMIT 4;
    `;
  const tweetsFeedArray = await db.all(getTweetsFeddQuery);
  const formattedArray = tweetsFeedArray.map((eachTweet) =>
    convertDbToResponse(eachTweet)
  );
  response.send(formattedArray);
});

//API 4

const convertDbFollowToResponseFollow = (data) => {
  return {
    name: data.name,
  };
};

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserId = `SELECT user_id FROM user WHERE username LIKE "${username}"`;
  const userData = await db.get(getUserId);
  const userId = userData.user_id;

  //   console.log(userId);
  const getFollowingListQuery = `
        SELECT name 
        FROM user INNER JOIN follower ON user.user_id = follower.following_user_id
        WHERE follower.follower_user_id = ${userId};
    `;
  const followList = await db.all(getFollowingListQuery);
  const formattedFollowList = followList.map((eachFollow) =>
    convertDbFollowToResponseFollow(eachFollow)
  );
  response.send(formattedFollowList);
});

//API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserId = `SELECT user_id FROM user WHERE username LIKE "${username}"`;
  const userData = await db.get(getUserId);
  const userId = userData.user_id;

  const getFollowersListQuery = `
        SELECT name
        FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
        WHERE follower.following_user_id = ${userId};
    `;
  const followerList = await db.all(getFollowersListQuery);
  const formattedFollowerList = followerList.map((eachFollow) =>
    convertDbFollowToResponseFollow(eachFollow)
  );
  response.send(formattedFollowerList);
});

// middleware authenticateTweetAccess

const authenticateTweetAccess = async (request, response, next) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUserId = `SELECT user_id FROM user WHERE username LIKE "${username}"`;
  const userData = await db.get(getUserId);
  const userId = userData.user_id;

  const getTweetQuery = `
        SELECT * FROM tweet INNER JOIN follower ON  tweet.user_id = follower.following_user_id
        WHERE tweet_id = ${tweetId} AND follower.follower_user_id = ${userId};  
     `;
  const tweetData = await db.get(getTweetQuery);
  if (tweetData === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

//API 6
app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  authenticateTweetAccess,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const getUserId = `SELECT user_id FROM user WHERE username LIKE "${username}"`;
    const userData = await db.get(getUserId);
    const userId = userData.user_id;

    const getTweetDataQuery = `
        SELECT tweet.tweet AS tweet,(SELECT COUNT() FROM like WHERE tweet_id = ${tweetId}) AS likes,
    (SELECT COUNT() FROM reply WHERE tweet_id = ${tweetId}) AS replies,
    date_time AS dateTime
        FROM tweet 
        WHERE tweet.tweet_id = ${tweetId}
    `;
    const tweet = await db.get(getTweetDataQuery);
    response.send(tweet);
  }
);

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  authenticateTweetAccess,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const getUserId = `SELECT user_id FROM user WHERE username LIKE "${username}"`;
    const userData = await db.get(getUserId);
    const userId = userData.user_id;

    const getLikesQuey = `
        SELECT username FROM user INNER JOIN like ON user.user_id = like.user_id
        WHERE like.tweet_id = ${tweetId}
    `;
    const likedUsers = await db.all(getLikesQuey);
    const likedUsersArray = likedUsers.map((eachUser) => eachUser.username);
    response.send({
      likes: likedUsersArray,
    });
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  authenticateTweetAccess,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const getUserId = `SELECT user_id FROM user WHERE username LIKE "${username}"`;
    const userData = await db.get(getUserId);
    const userId = userData.user_id;

    const getReplyQuey = `
        SELECT name , reply FROM user INNER JOIN reply ON user.user_id = reply.user_id
        WHERE reply.tweet_id = ${tweetId}
    `;
    const repliedUsers = await db.all(getReplyQuey);

    response.send({
      replies: repliedUsers,
    });
  }
);

//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserId = `SELECT user_id FROM user WHERE username LIKE "${username}"`;
  const userData = await db.get(getUserId);
  const userId = userData.user_id;

  const getTweetsOfUser = `
        SELECT tweet,COUNT(DISTINCT like.like_id) AS likes, COUNT(DISTINCT reply.reply_id) AS replies,tweet.date_time AS dateTime
        FROM tweet LEFT JOIN like ON tweet.tweet_id = like.tweet_id LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
        WHERE tweet.user_id =${userId}
        GROUP BY  tweet.tweet_id;
     `;
  const tweets = await db.all(getTweetsOfUser);
  response.send(tweets);
});

//API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const getUserId = `SELECT user_id FROM user WHERE username LIKE "${username}"`;
  const userData = await db.get(getUserId);
  const userId = userData.user_id;

  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
  const createTweetQuery = `INSERT INTO tweet(tweet,user_id,date_time)
    VALUES('${tweet}',${userId},'${dateTime}')
    `;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserId = `SELECT user_id FROM user WHERE username LIKE "${username}"`;
    const userData = await db.get(getUserId);
    const userId = userData.user_id;
    const getTheTweetQuery = `SELECT * FROM tweet WHERE user_id = ${userId} AND tweet_id = ${tweetId};`;
    const tweet = await db.get(getTheTweetQuery);
    console.log(tweet);
    if (tweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id ='${tweetId}';`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
