import Court from "../models/Court.js";

/** ===========================
 *  GET /api/courts
 *  Fetch all courts
 *  =========================== */
export const getCourts = async (req, res) => {
  try {
    const courts = await Court.find({})
      .sort({ name: 1 })
      .select("_id name level code location");

    res.status(200).json({
      success: true,
      count: courts.length,
      data: courts,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch courts",
      error: err.message,
    });
  }
};

/** ===========================
 *  POST /api/courts
 *  Create a single court
 *  =========================== */
export const createCourt = async (req, res) => {
  try {
    const court = await Court.create(req.body);

    res.status(201).json({
      success: true,
      message: "Court created successfully",
      data: court,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: "Failed to create court",
      error: err.message,
    });
  }
};

/** ===========================
 *  POST /api/courts/bulk
 *  Bulk import courts
 *  Body: { courts: [{name, emails:[], ...}, ...]}
 *  =========================== */
export const bulkCreateCourts = async (req, res) => {
  try {
    const { courts = [] } = req.body;

    if (!Array.isArray(courts) || courts.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No courts provided",
      });
    }

    const ops = courts.map((c) => ({
      updateOne: {
        filter: { name: c.name.toUpperCase().trim() }, // normalize for consistency
        update: { $set: { ...c, name: c.name.toUpperCase().trim() } },
        upsert: true,
      },
    }));

    const result = await Court.bulkWrite(ops);

    res.status(200).json({
      success: true,
      message: "Courts imported successfully",
      inserted: result.upsertedCount,
      modified: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed bulk import",
      error: err.message,
    });
  }
};
