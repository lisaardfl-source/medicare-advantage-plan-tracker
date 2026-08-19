import { Router, type IRouter } from "express";
import healthRouter from "./health";
import statesRouter from "./states";
import countiesRouter from "./counties";
import plansRouter from "./plans";
import benefitsRouter from "./benefits";
import enrollmentsRouter from "./enrollments";
import summaryRouter from "./summary";
import marketShareRouter from "./market-share";

const router: IRouter = Router();

router.use(healthRouter);
router.use(statesRouter);
router.use(countiesRouter);
router.use(plansRouter);
router.use(benefitsRouter);
router.use(enrollmentsRouter);
router.use(summaryRouter);
router.use(marketShareRouter);

export default router;
