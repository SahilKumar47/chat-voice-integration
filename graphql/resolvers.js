const { validateUser, validateLogin } = require("../utils/validators");
const { UserInputError, AuthenticationError } = require("apollo-server");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");

const { User, Message } = require("../models");
const { CHAT_SECRET_KEY } = require("../config/env.json");

module.exports = {
  Query: {
    getUsers: async (_, __, { user }) => {
      try {
        if (!user) throw new AuthenticationError("Invalid/expired token");

        const users = await User.findAll({
          where: { username: { [Op.ne]: user.username } },
        });
        return users;
      } catch (err) {
        console.log(err);
        throw err;
      }
    },
    login: async (_, args) => {
      const { username, password } = args;
      //validation
      let { errors, valid } = validateLogin(username, password);
      try {
        //check validation
        if (!valid) throw new UserInputError("Errors", { errors });
        //Find User
        const user = await User.findOne({ where: { username } });
        if (!user) {
          errors.username = "User not found!";
          throw new UserInputError("User not found", { errors });
        }
        //check password
        const correctPassword = await bcrypt.compare(password, user.password);
        console.log(correctPassword);
        if (!correctPassword) {
          errors.password = "Password is incorrect";
          throw new UserInputError("password is incorrect", { errors });
        }
        //generate token
        const token = jwt.sign(
          {
            username: user.username,
            email: user.email,
          },
          CHAT_SECRET_KEY,
          { expiresIn: 60 * 60 }
        );
        return {
          ...user.toJSON(),
          createdAt: user.createdAt.toISOString(),
          token,
        };
      } catch (err) {
        console.log(err);
        throw err;
      }
    },
  },
  Mutation: {
    register: async (_, args) => {
      let { username, email, password, confirmPassword } = args;
      let { errors, valid } = validateUser(
        username,
        email,
        password,
        confirmPassword
      );

      try {
        if (!valid) {
          throw errors;
        }

        // Hash password
        password = await bcrypt.hash(password, 6);

        // Create user
        const user = await User.create({
          username,
          email,
          password,
        });

        // Return user
        return user;
      } catch (err) {
        console.log(err);
        if (err.name === "SequelizeUniqueConstraintError") {
          err.errors.forEach(
            (e) =>
              (errors[e.path.split(".")[1]] = `${
                e.path.split(".")[1]
              } is already taken`)
          );
        } else if (err.name === "SequelizeValidationError") {
          err.errors.forEach((e) => (errors[e.path] = e.message));
        }
        throw new UserInputError("Bad input", { errors });
      }
    },
    sendMessage: async (_, { to, content }, { user }) => {
      try {
        if (!user) throw new AuthenticationError("unauthenticated");
        const recipient = await User.findOne({ where: { username: to } });
        if (!recipient) throw new UserInputError("User not found");
        else if (recipient.username === user.username) {
          throw new UserInputError("Can't send message to yourself");
        }
        if (content.trim() === "") {
          throw new UserInputError("Message is empty");
        }
        const message = await Message.create({
          from: user.username,
          to,
          content,
        });
        return message;
      } catch (error) {
        console.log(error);
        throw error;
      }
    },
  },
};
