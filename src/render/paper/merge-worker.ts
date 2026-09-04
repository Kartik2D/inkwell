import paper from "paper";
import { mergeJsons } from "./merge-layer";

paper.setup([1, 1]);

type MergeJob = {
  id: number;
  baseJson: string;
  additionsJson: string;
  emfActive: boolean;
};

onmessage = (event: MessageEvent<MergeJob>) => {
  const { id, baseJson, additionsJson, emfActive } = event.data;
  try {
    const mergedJson = mergeJsons(baseJson, additionsJson, emfActive);
    postMessage({ id, mergedJson });
  } catch (error) {
    postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
