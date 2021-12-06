const log = require('@connibug/js-logging');

const { exec } = require("child_process");
let alreadUpToDateREGEX = new RegExp('Already.up.to.date');

module.exports.handleCD = () => {
    exec("git stash", (error, stdout, stderr) => {
        exec("git pull", (error, stdout, stderr) => {
            if (error) {
                log.error(`error: ${error.message}`);
                
                // As there was an issue restart
                process.exit(1);
            }
            if (stderr) {
                log.error(`stderr: ${stderr}`);
            }
            if(stdout.match(alreadUpToDateREGEX)) {
                return;
            }
            else {
                log.warning(`stdout: ${stdout}`);
                process.exit(1);
            }
        });
    });
}
