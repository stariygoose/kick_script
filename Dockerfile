# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install any needed packages
RUN npm i

# Bundle app source
COPY . .

# Your app binds to port 8080 so you'll use the EXPOSE instruction
# EXPOSE 8080

# Define the command to run your app
CMD [ "npm", "run", "prod" ]
