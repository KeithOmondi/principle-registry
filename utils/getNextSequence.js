import Counter from "../models/Counter";

export const getNextSequence = async (name) => {
  const counter = await Counter.findByIdAndUpdate(
    name, // the _id is the counter name (e.g., "recordNo")
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  // Just in case it somehow didn’t return a doc
  if (!counter) {
    const newCounter = await Counter.create({ _id: name, value: 1 });
    return newCounter.value;
  }

  return counter.value;
};


