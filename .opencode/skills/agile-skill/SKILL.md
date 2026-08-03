---
name: agile-skill
description: Use when starting a project, kicking off a Sprint, or working a Task with a human-controlled, file-based Epic/User Story/Task process — align on scope before writing docs, split each Task into its own session, and confirm the human actually understands the code before it counts as reviewed.
---

# Sprint 導向開發流程(Epic → User Story → Task)

保留人類在這個流程中的兩個控制點:**需求對齊**與**code review 批准**。但這一版工作橫跨多個 Sprint、多個 session,需要拆解成 Epic / User Story / Task 三層文件並各自追蹤進度,所以用資料夾與檔案結構承載狀態,取代單一 STATE.md。

## 資料夾結構

全部寫在使用這個 Skill 的專案裡,路徑是 `.opencode/agile/`(不是這個 Skill 套件自己的資料夾):

```
.opencode/agile/
  epics/
    active/
      epic-<slug>.md
    done/
      epic-<slug>.md
  sprint/
    SPRINT.md
    stories/
      active/
        story-<slug>.md
      done/
        story-<slug>.md
    tasks/
      active/
        task-<slug>.md
      done/
        task-<slug>.md
```

- Epic 常駐,可能橫跨多個 Sprint。當它底下**全部** User Story 都進了 `stories/done/`,才把 Epic 檔案從 `epics/active/` 移到 `epics/done/`。
- `SPRINT.md` 是新 session 接續進度的入口,結構類似原本的 STATE.md(Current + History),但改記錄 Sprint 層級的狀態。
- Sprint 的範圍不是由 Epic 決定,而是由「這次 Sprint 對齊時,哪些 story/task 檔案被放進 `active/`」決定——這些項目可以全部來自同一個 Epic,也可以跨好幾個 Epic,沒有限制。每個 story/task 檔案的 front matter 記錄自己屬於哪個 Epic/Story,方便追蹤,但不影響 Sprint 邊界的判斷。
- **Sprint 結束的唯一判斷標準:`sprint/stories/active/` 與 `sprint/tasks/active/` 都清空。** 不看跨了幾個 Epic,也不看時間長短。

## 檔案模板

### Epic — `epics/active/epic-<slug>.md`

```markdown
---
id: epic-<slug>
status: active
created: <date>
---

# Epic:<標題>

## 目標 / 背景

## 涵蓋的 User Story
- [ ] story-<slug> — <一行描述>

## Notes
```

### User Story — `sprint/stories/active/story-<slug>.md`

```markdown
---
id: story-<slug>
epic: epic-<slug>
status: active
created: <date>
---

# User Story:<標題>

作為<角色>,我想要<需求>,以便<價值>。

## 驗收標準
-

## 拆解的 Task
- [ ] task-<slug> — <一行描述>

## Notes
```

### Task — `sprint/tasks/active/task-<slug>.md`

```markdown
---
id: task-<slug>
story: story-<slug>
epic: epic-<slug>
status: active   # active | in-progress | testing | review | done
---

# Task:<標題>

## 對齊內容(Goal / Scope / Approach)

## 測試方式

## Review 紀錄
(通過日期、review 過程中問過的關鍵問題摘要)
```

### `sprint/SPRINT.md`

```markdown
# Sprint <n>

- Sprint 目標:
- 開始日期:
- 狀態: active | completed

## 本次 Sprint 範圍
- Stories:
  - [ ] story-<slug>
- Tasks:
  - [ ] task-<slug>

## 目前進行中
(正在哪個 task session、下一個要做的 task 是什麼)

## Notes

# 歷史 Sprint
(most recent on top — Sprint 完成時把上面的內容移到這裡,附上完成日期與涵蓋的 story/task 清單)
```

## 生命週期

### 1. Sprint 啟動 / 新需求丟入

當人類開始一個新專案,或在既有專案上丟出新的一批需求(新 Sprint):

1. **對齊需求**——這是 gate 1,不能省略:詳細來回確認目標、範圍、優先順序,直到人類明確確認。
2. 對齊後,產出文件:
   - 全新專案或全新主題 → 建立 `epics/active/epic-<slug>.md`;若是延伸既有 Epic,更新既有檔案的「涵蓋的 User Story」清單。
   - 依 Epic 拆出這次要做的 User Story → 各自建立 `sprint/stories/active/story-<slug>.md`。
   - 依每個 Story 拆出 Task → 各自建立 `sprint/tasks/active/task-<slug>.md`。
   - 建立/更新 `sprint/SPRINT.md`,列出這次 Sprint 涵蓋的 story/task 清單。
3. 文件產出後,**建議切一個新 session** 開始做第一個 Task(哪一個由人類挑,或問人類要先做哪個)。這是建議,不是強制——狀態都在檔案裡,換不換 session 不影響進度。

### 2. 一個 Task 就是一個 Session

每個 session 只聚焦一個 Task:

1. Session 開始先讀 `sprint/SPRINT.md`,找到目前要做的 Task,再讀該 Task 檔案(以及它所屬的 Story、Epic,取得背景)。
2. 因為 Task 在 Sprint 啟動時已經對齊過範圍,這裡只需要簡短覆述一次「這個 Task 要做的事」讓人類確認還沒變,不用整個重新來一次 gate 1。若範圍中途變了,回到 gate 1 重新對齊,並更新 Task 檔案。
3. 實作、測試,測試通過後才進入下一步。

### 3. Task 完成後的 Code Review(確保理解,不只是 approve)

測試通過後,不是單純問「approve 嗎」,而是要確保人類**真的理解**這段程式碼:

1. 先簡述變更了什麼、在哪些檔案、關鍵邏輯是什麼。
2. 針對這次變更的關鍵邏輯,主動提出幾個具體問題讓人類回答(例如:「這裡為什麼要這樣處理?」「如果 X 情況發生,這段程式碼會怎麼反應?」)。不是走過場的是非題,問題要問到能反映人類是否真的懂了這段邏輯。
3. 人類的回答顯示理解不足或有誤,就補充說明、再確認,不能直接放行。
4. 理解確認之後,才問是否 approve。只有人類明確的 approve 才算數——silence、測試通過、AI 自己的判斷都不算。
   - **Approved**:把 Task 檔案的 `status` 改成 `done`,連同檔案本身從 `tasks/active/` 移到 `tasks/done/`。
   - 檢查該 Task 所屬的 Story 是否所有 Task 都完成了:若是,Story 的 `status` 改 `done`,檔案從 `stories/active/` 移到 `stories/done/`。
   - 檢查該 Story 所屬的 Epic 是否所有 Story 都完成了:若是,Epic 的 `status` 改 `done`,檔案從 `epics/active/` 移到 `epics/done/`。
   - 更新 `SPRINT.md` 的勾選狀態。
   - **Changes requested**:回去實作,不能再次宣稱完成,直到重新走過一次這個 review 流程。
5. Approve 之後,**引導人類結束這個 session**:告知這個 Task 完成、下一個 active 的 Task 是什麼,建議開新 session 去做下一個。

### 4. Sprint 結束判定

每次有 Task/Story 完成、移動檔案之後,順手檢查 `sprint/stories/active/` 與 `sprint/tasks/active/` 是否都已清空:

- 都清空 → 這個 Sprint 完成。把 `SPRINT.md` 的 Current 內容移到「歷史 Sprint」,標記完成日期,並告知人類這個 Sprint 結束了,準備進入下一次 Sprint 啟動(回到流程 1)。
- 沒清空 → 照常繼續下一個 active 的 Task。

## Non-negotiable rules

1. 所有面向人類的回覆,以及寫進 `.opencode/agile/` 的內容,一律使用繁體中文。程式碼、指令、檔案路徑、識別字保持原樣。
2. 新 Sprint 或新需求丟入時,沒有經過人類明確確認目標與範圍之前,不建立 Epic/Story/Task 文件、不開始實作。
3. 一個 session 只聚焦一個 Task;不在同一個 session 裡跳去做另一個不相關的 Task。
4. Task 完成、測試通過後,必須先透過主動提問確認人類真的理解程式碼邏輯,才能問 approve;不能把「approve 嗎」當成唯一的 review 步驟。
5. 沒有人類明確的 approve,不能宣稱 Task 完成,也不能把檔案從 `active/` 移到 `done/`。
6. Task/Story/Epic 完成後的檔案搬移(`active/` → `done/`)、`SPRINT.md` 更新,都要在 approve 當下就做,不要延後。
7. Sprint 結束的唯一判斷標準是 `sprint/stories/active/` 與 `sprint/tasks/active/` 都清空;不用 Epic 邊界或時間長度判斷。
8. 每個 session 開始時,先讀 `sprint/SPRINT.md` 確認目前狀態(進行中的 Task、是否有等待 review 的項目),再開始任何新工作。
9. Task approve 後,建議人類開新 session 做下一個 Task;這是建議,人類可以選擇留在原 session 繼續。
10. 若實作中途範圍超出當初對齊的內容,停下來重新對齊,並更新對應的 Task/Story 文件,不要默默擴大範圍。
11. 這個 Skill 是 prompt 層級的引導,不是強制執行——沒有任何機制真的阻止程式碼在沒走完這些步驟的情況下被寫出或合併。它能發揮作用,是因為被確實遵守,而不是因為平台擋下了其他路徑。
