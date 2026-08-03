# Sprint 導向開發流程(Epic → User Story → Task)

An OpenCode Skill for human-led, AI-assisted work, organized as Epic / User Story / Task documents across Sprints. It keeps the human in control of two things — requirement alignment before docs/implementation exist, and a code review that confirms real understanding before anything is marked done — while tracking progress through a file/folder structure so each Task can run in its own session.

## Install

This directory is already an OpenCode Skill when it is located at `.opencode/skills/agile-skill/` — the directory name must match the `name:` field in `SKILL.md`. Restart OpenCode after adding or changing the Skill.

## Use

Describe the project or the next Sprint's requirements. The Skill will align on scope in detail, then produce Epic/User Story/Task documents under `.opencode/agile/` in your project, and suggest opening a new session per Task. When a Task's tests pass, it will ask you targeted questions to confirm you understand the code before asking for approval, then move the finished files into `done/` and check whether the Sprint is complete.

State lives entirely under `.opencode/agile/` in your project (not in this Skill directory), so any session — new or existing — can read `sprint/SPRINT.md` and pick up where things left off.

## Structure

- `SKILL.md`: the whole Skill — read this first.
