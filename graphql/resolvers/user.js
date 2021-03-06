const { validateUser, validateLogin } = require("../../utils/validators");
const { UserInputError, AuthenticationError } = require("apollo-server");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");

const { User, Message } = require("../../models");

module.exports = {
  Query: {
    getUsers: async (_, __, { user }) => {
      try {
        if (!user) throw new AuthenticationError("Invalid/expired token");

        let users = await User.findAll({
          attributes: ["username", "imageUrl", "createdAt"],
          where: { username: { [Op.ne]: user.username } },
        });
        const allUserMeassages = await Message.findAll({
          where: {
            [Op.or]: [{ from: user.username }, { to: user.username }],
          },
          order: [["createdAt", "DESC"]],
        });
        users = users.map((otherUser) => {
          const latestMessage = allUserMeassages.find(
            (msg) =>
              msg.from === otherUser.username || msg.to === otherUser.username
          );
          otherUser.latestMessage = latestMessage;
          return otherUser;
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
          process.env.CHAT_SECRET_KEY,
          { expiresIn: 60 * 60 }
        );
        return {
          ...user.toJSON(),
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
  },
};
