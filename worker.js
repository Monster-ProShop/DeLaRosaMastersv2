import adminHTML from './private/admin.html.txt';
import adminFinals from './private/finals.js.txt';
import adminStyle from './private/finals.css.txt';
import { createHandler } from './server.js';
export default {fetch:createHandler({adminHTML,adminFinals,adminStyle})};
