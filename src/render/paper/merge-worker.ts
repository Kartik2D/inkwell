import paper from "paper";
import { mergeJsons } from "./merge-layer";

paper.setup([1, 1]);

type MergeJob = {
  id: number;
  baseJson: string;
  additionsJson: string;
};

onmessage = (event: MessageEvent<MergeJob>) => {
  const { id, baseJson, additionsJson } = event.data;
  try {
    const mergedJson = mergeJsons(baseJson, additionsJson);
    postMessage({ id, mergedJson });
  } catch (error) {
    postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
