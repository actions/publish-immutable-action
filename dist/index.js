"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * The entrypoint for the action.
 */
const main_1 = require("./main");
const minimist_1 = __importDefault(require("minimist"));
const path = (0, minimist_1.default)(process.argv.slice(2)).path || '.';
// eslint-disable-next-line @typescript-eslint/no-floating-promises
(0, main_1.run)(path);
//# sourceMappingURL=index.js.map