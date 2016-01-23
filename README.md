Winter ARG tester: the back-end
---

This is the back-end used by [the Winter ARG tester](https://github.com/opl-/winter-arg-tester). You will need [Node.js](https://nodejs.org/) and npm (which comes in a bundle with Node.js) in order to run this.

Set up
---

1. Download [Node.js](https://nodejs.org/) and install it, making sure to also install npm which is bundled with Node.js.
2. Clone this repository.
3. Run `npm install` in the directory you cloned this project to.
4. Create the database and tables using the `database.sql` file. That file also contains all the data exported from the original database.
5. Acquire a site key and a secret key for Recaptcha from [here](https://www.google.com/recaptcha/admin#list).
6. Create a duplicate of the `config-template.json` file and name it `config.json`.
7. Enter credentials to the database (`mysql.host`, `mysql.port`, `mysql.user`, `mysql.password`), the name of the database (`mysql.database`), as well as site (`recaptcha.publicKey`) and secret (`recaptcha.privateKey`) keys in the newly created file.
8. Run the server with `node ./`.