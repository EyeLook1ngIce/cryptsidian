import {App, Modal, FileView, Workspace, Plugin, WorkspaceLeaf, setIcon, moment, Notice, TFile} from 'obsidian';
import * as cryptoSource from './cryptsidian.mjs';
import sha256 from 'crypto-js/sha256';
/*
// functions we're importing
import {hasEnoughEntropy, stringSanitizer, setUserSecretKey, keyDeriver, encryptFile, decryptFile, getVaultFiles, fileProcessor, getFileBuffer, openFile} from './tmpcryptsidian.mjs';

// variables we're importing
import {ALGORITHM, SALT, ENCRYPT, DECRYPT, KEY_LENGTH} from './tmpcryptsidian.js';
*/

const SOLID_PASS = 'qBjSbeiu2qDNEq5d';

interface MyPluginSettings {
    mySetting: string;
    encryption: boolean;
    dataSaveTime: string;
    isLastVerifyPasswordCorrect: boolean;
    timeOnUnload: moment.Moment | number;
    password: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    mySetting: 'default',
    encryption: false,
    dataSaveTime: '1970-01-01 00:00:00',
    isLastVerifyPasswordCorrect: false,
    timeOnUnload: 0,
    password: ''
}

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;
    passwordRibbonBtn: HTMLElement;
    lastPassword: string;
    useLastPassword: boolean;

    async onload() {
        console.log('loading plugin');

        await this.loadSettings();

        if (this.settings.encryption) {
            this.passwordRibbonBtn = this.addRibbonIcon('unlock-keyhole', "disable_encryption", (evt: MouseEvent) => {
                this.switchPasswordProtection();
            });
        } else {
            this.passwordRibbonBtn = this.addRibbonIcon('lock-keyhole', "enable_encryption", (evt: MouseEvent) => {
                this.switchPasswordProtection();
            });
        }
        this.addCommand({
            id: 'open-encrypt-modal',
            name: 'Open Encrypt Modal',

            checkCallback: (checking: boolean) => {
                let leaf = this.app.workspace.activeLeaf;
                if (leaf) {
                    if (!checking) {
                        new CryptoModal(this.app, 'Encrypt', this).open();
                    }
                    return true;
                }
                return false;
            }

        });

        this.addCommand({
            id: 'open-decrypt-modal',
            name: 'Open Decrypt Modal',

            checkCallback: (checking: boolean) => {
                let leaf = this.app.workspace.activeLeaf;
                if (leaf) {
                    if (!checking) {
                        new CryptoModal(this.app, 'Decrypt', this).open();
                    }
                    return true;
                }
                return false;
            }

        });

        this.addCommand({
            id: 'open-use-last-password',
            name: 'Open Use Last Password',

            checkCallback: (checking: boolean) => {
                let leaf = this.app.workspace.activeLeaf;
                if (leaf) {
                    if (!checking) {
                        if (this.lastPassword && this.settings.isLastVerifyPasswordCorrect) {
                            this.useLastPassword = true
                            new Notice("Open use last password success")
                        } else {
                            new Notice("You need to perform encryption and correct decryption first");
                        }
                    }
                    return true;
                }
                return false;
            }

        });

        this.addCommand({
            id: 'close-use-last-password',
            name: 'Close Use Last Password',

            checkCallback: (checking: boolean) => {
                let leaf = this.app.workspace.activeLeaf;
                if (leaf) {
                    if (!checking) {
                        this.useLastPassword = false
                    }
                    return true;
                }
                return false;
            }

        });

        this.registerEvent(this.app.workspace.on('file-open', (file: TFile | null) => {
            if (file != null) {
                if(this.settings.encryption){
                    this.closeLeave(file)
                    new CryptoModal(this.app, 'Decrypt', this).open();
                }
            }
        }));
    }

    async closeLeave(file: TFile) {
        let leaves: WorkspaceLeaf[] = [];

        this.app.workspace.iterateAllLeaves((leaf) => {
            leaves.push(leaf);
        });

        const emptyLeaf = async (leaf: WorkspaceLeaf): Promise<void> => {
            leaf.setViewState({ type: 'empty' });
        }

        for (const leaf of leaves) {
            if (leaf != null && leaf.view instanceof FileView) {
                if (leaf.view.file != null) {
                    if (leaf.view.file.path == file.path) {
                        await emptyLeaf(leaf);
                        leaf.detach();
                        break;
                    }
                }
            }
        }
    }

    async onunload() {
        console.log('unloading plugin');
        this.settings.isLastVerifyPasswordCorrect = false
        this.settings.timeOnUnload = moment();
        await this.saveSettings();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async crypt(password:string,operation:string){
        // @ts-ignore
        let vault_dir = this.app.vault.adapter.getBasePath();
        cryptoSource.setUserSecretKey(password); //derive the secret key via scrypt from user's password

        // close open notes to prevent post-encryption access, which can corrupt files and make them irrecoverable
        const emptyLeaf = async (leaf: WorkspaceLeaf): Promise<void> => {
            leaf.setViewState({type: 'empty'});
        }

        const closeLeaves = async (): Promise<void> => { // we use this function construction to get async/await and keep the right "this"
            let leaves: WorkspaceLeaf[] = [];

            this.app.workspace.iterateAllLeaves((leaf) => {
                leaves.push(leaf);
            });

            for (const leaf of leaves) {
                if (leaf.view instanceof FileView) {
                    await emptyLeaf(leaf);
                    leaf.detach();
                }
            }
        }

        const processFiles = async (): Promise<void> => {
            await closeLeaves();
            cryptoSource.fileProcessor(files, operation.toUpperCase());
        }

        //run the encryption or decryption
        let files = cryptoSource.getVaultFiles(vault_dir);
        this.lastPassword = password
        await processFiles();
        if (operation.toUpperCase() === 'ENCRYPT') {
            this.settings.encryption = true
            this.settings.password = sha256(password + SOLID_PASS).toString();
            await this.saveSettings()
            setIcon(this.passwordRibbonBtn, "unlock-keyhole")
            this.passwordRibbonBtn.ariaLabel = "disable_encryption";
        } else if (operation.toUpperCase() === 'DECRYPT') {
            this.settings.encryption = false
            await this.saveSettings()
            setIcon(this.passwordRibbonBtn, "lock-keyhole")
            this.passwordRibbonBtn.ariaLabel = "enable_encryption";
        }
    }

    private async switchPasswordProtection() {
        if (this.settings.encryption) {
            if (this.useLastPassword && this.lastPassword) {
                await this.crypt(this.lastPassword, 'Decrypt')
            } else {
                new CryptoModal(this.app, 'Decrypt', this).open();
            }
        } else {
            if (this.useLastPassword && this.lastPassword) {
                await this.crypt(this.lastPassword, 'Encrypt')
            } else {
                new CryptoModal(this.app, 'Encrypt', this).open();
            }
        }
    }
}

class CryptoModal extends Modal {
    password: string = null;
    operation: string = null;
    plugin: MyPlugin

    constructor(app: App, operation: string, plugin: MyPlugin) {
        super(app);
        this.operation = operation;
        this.plugin = plugin
    }

    onOpen() {
        // get vault dir
        // @ts-ignore
        let vault_dir = this.app.vault.adapter.getBasePath();
        //initiailze an empty DOM object to hold our modal
        let {contentEl} = this;
        contentEl.empty();

        //title - to let the user know which mode (encrypt/decrypt) they're in
        const titleEl = contentEl.createDiv();
        titleEl.style.fontWeight = 'bold';
        titleEl.style.marginBottom = '1em';
        titleEl.setText(`${this.operation}`);

        //notice - to let the user know which folder will be encrypted/decrypted
        const folderNotice = contentEl.createDiv();
        folderNotice.style.marginBottom = '1em';
        folderNotice.setText('This operation will apply to all files and folders in: ' + vault_dir);
        folderNotice.style.color = 'red';

        //notice - tell user not to open encrpyted files
        const corrputionNotice = contentEl.createDiv();
        corrputionNotice.style.marginBottom = '1.5em';
        corrputionNotice.setText('Do not open files with Obsidian after encrypting - they can become corrupted and irrecoverable. Always use the Decrypt command prior to re-opening files!');
        corrputionNotice.style.color = 'red';

        //make a div for user's pw input
        const inputPwContainerEl = contentEl.createDiv();
        const pwInputEl = inputPwContainerEl.createEl('input', {type: 'password', value: ''});
        pwInputEl.placeholder = 'Please enter your password';
        pwInputEl.style.width = '70%';
        pwInputEl.focus();

        //make a div for pw confirmation
        const confirmPwContainerEl = contentEl.createDiv();
        confirmPwContainerEl.style.marginTop = '1em';
        const pwConfirmEl = confirmPwContainerEl.createEl('input', {type: 'password', value: ''});
        pwConfirmEl.placeholder = 'Confirm your password';
        pwConfirmEl.style.width = '70%';

        //make a submit button for the crypto operation
        const confirmBtnEl = confirmPwContainerEl.createEl('button', {text: `${this.operation}`});
        confirmBtnEl.style.marginLeft = '1em';

        //message modal - to fire if passwords don't match
        const messageMatchEl = contentEl.createDiv();
        messageMatchEl.style.marginTop = '1em';
        messageMatchEl.style.color = 'red';
        messageMatchEl.setText('Passwords must match');
        messageMatchEl.hide();

        //message modal - to fire if either input is empty
        const messageEmptyEl = contentEl.createDiv();
        messageEmptyEl.style.marginTop = '1em';
        messageEmptyEl.style.color = 'red';
        messageEmptyEl.setText('Please enter your password in both boxes.');
        messageEmptyEl.hide();

        //message modal - to fire with cryptoSource.stringSanitizer() error message, if any
        const messageEl = contentEl.createDiv();
        messageEl.style.color = 'red';
        messageEl.style.marginTop = '1em';
        messageEl.hide();

        const messageCorrectEl = contentEl.createDiv();
        messageCorrectEl.style.marginTop = '1em';
        messageCorrectEl.style.color = 'red';
        messageCorrectEl.setText('Passwords not correct');
        messageCorrectEl.hide();

        // check the input
        // @ts-ignore
        const pwChecker = async (ev) => { // we use an arrow function to preserve access to the "this" we want
            ev.preventDefault();
            let good_to_go = false;

            // is either input field empty?
            if (pwInputEl.value == '' || pwInputEl.value == null || pwConfirmEl.value == '' || pwConfirmEl.value == null) {
                good_to_go = false;
                messageEmptyEl.show();
            }

            if (pwInputEl.value !== '' && pwInputEl.value !== null && pwConfirmEl.value !== '' && pwConfirmEl.value !== null) {
                good_to_go = true;
                messageEmptyEl.hide();
            }

            // do both password inputs match?
            if (pwInputEl.value !== pwConfirmEl.value) {
                good_to_go = false;
                messageMatchEl.show();
            }

            if (pwInputEl.value === pwConfirmEl.value) {
                good_to_go = true;
                messageMatchEl.hide();
            }
            if (this.operation.toUpperCase() === 'DECRYPT') {
                const sha = sha256(pwInputEl.value + SOLID_PASS).toString();
                if (this.plugin.settings.password === sha) {
                    good_to_go = true;
                    messageCorrectEl.hide()
                    this.plugin.settings.isLastVerifyPasswordCorrect = true
                } else {
                    good_to_go = false
                    messageCorrectEl.show()
                    this.plugin.settings.isLastVerifyPasswordCorrect = false
                }
                await this.plugin.saveSettings()
            }
            // is the user's password strong enough for crypto?
            if (good_to_go) {
                try {
                    messageEl.hide();
                    good_to_go = Boolean(cryptoSource.stringSanitizer(pwInputEl.value));
                    //true if user input had enough entropy, false otherwise
                } catch (error) {
                    good_to_go = false;
                    messageEl.setText(error.message);
                    messageEl.show();
                }
            }

            // if all checks pass, execute the crypto operation
            if (good_to_go) {
                this.password = pwConfirmEl.value;
                await this.plugin.crypt(pwConfirmEl.value,this.operation)
                this.close();
            }
        }

        //register the button's event handler
        confirmBtnEl.addEventListener('click', pwChecker);

        //allow enter to submit
        // @ts-ignore
        const enterSubmits = function (ev, value) {
            if (
                (ev.code === 'Enter' || ev.code === 'NumpadEnter')
                && value.length > 0
                && confirmBtnEl.disabled === false
            ) {
                ev.preventDefault();
                confirmBtnEl.click();
            }
        }
        pwInputEl.addEventListener('keypress', function (ev) {
            enterSubmits(ev, pwInputEl.value)
        });
        pwConfirmEl.addEventListener('keypress', function (ev) {
            enterSubmits(ev, pwInputEl.value)
        });

    }

    onClose() {
        let {contentEl} = this;
        contentEl.empty();
    }
}
