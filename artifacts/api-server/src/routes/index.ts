import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import messagesRouter from "./messages.js";
import mailboxRouter from "./mailbox.js";
import smsRouter from "./sms.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/messages", messagesRouter);
router.use("/mailbox", mailboxRouter);
router.use("/sms", smsRouter);

export default router;
