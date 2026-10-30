// The page's fixed elements, looked up once at boot.
export interface Elements {
  app: HTMLElement;
  progress: HTMLElement;
  endlessToggle: HTMLButtonElement;
  levelsToggle: HTMLButtonElement;
  levels: HTMLElement;
  levelList: HTMLElement;
  chapter: HTMLElement;
  title: HTMLElement;
  brief: HTMLElement;
  buffer: HTMLElement;
  goalNote: HTMLElement;
  goal: HTMLElement;
  mode: HTMLElement;
  search: HTMLElement;
  notice: HTMLElement;
  pos: HTMLElement;
  keys: HTMLElement;
  best: HTMLElement;
  hint: HTMLElement;
  solution: HTMLButtonElement;
  solutionKeys: HTMLElement;
  done: HTMLElement;
  doneTitle: HTMLElement;
  doneText: HTMLElement;
  doneStats: HTMLElement;
  next: HTMLButtonElement;
  retry: HTMLButtonElement;
  help: HTMLButtonElement;
  helpDlg: HTMLDialogElement;
  helpList: HTMLElement;
  helpClose: HTMLButtonElement;
}

function byId<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element: ${id}`);
  return found as T;
}

export function getElements(): Elements {
  return {
    app: byId('tvApp'),
    progress: byId('tvProgress'),
    endlessToggle: byId('tvEndless'),
    levelsToggle: byId('tvLevelsToggle'),
    levels: byId('tvLevels'),
    levelList: byId('tvLevelList'),
    chapter: byId('tvChapter'),
    title: byId('tvTitle'),
    brief: byId('tvBrief'),
    buffer: byId('tvBuffer'),
    goalNote: byId('tvGoalNote'),
    goal: byId('tvGoal'),
    mode: byId('tvMode'),
    search: byId('tvSearch'),
    notice: byId('tvNotice'),
    pos: byId('tvPos'),
    keys: byId('tvKeys'),
    best: byId('tvBest'),
    hint: byId('tvHint'),
    solution: byId('tvSolution'),
    solutionKeys: byId('tvSolutionKeys'),
    done: byId('tvDone'),
    doneTitle: byId('tvDoneTitle'),
    doneText: byId('tvDoneText'),
    doneStats: byId('tvDoneStats'),
    next: byId('tvNext'),
    retry: byId('tvRetry'),
    help: byId('tvHelp'),
    helpDlg: byId('tvHelpDlg') as HTMLDialogElement,
    helpList: byId('tvHelpList'),
    helpClose: byId('tvHelpClose'),
  };
}
