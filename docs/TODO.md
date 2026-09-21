# Music Library Manager — TODO

## 1. Improve testing

- [x] Add a complete e2e test suite using Playwright and cucumber *(the 9-task progress tracker below is fully complete: 103 e2e scenarios, all passing as of this session's final verification)*
- [x] I want to have the cucumber files so the test scenarios are human-readable and easily updated when needed
- [x] scripts to launch e2e tests should contain both headless and headed browser mode
- [x] tester agent should run the e2e test suite (in headless mode, headed mode is for human review only)
- [ ] tester and/or reviewer agent should identify critical failure path and make sure its cover with test *(ongoing — each per-area task keeps finding and closing gaps)*
- [x] Run complete audit on test coverage, ensure all feature are covered, e2e tests run relevant scenarios *(Task 9 below — audit itself is complete; the gaps it found are tracked as the "Task 9 follow-ups" list below, not blockers on this line)*
- [x] Full regression tests path should be implemented (either with unit tests, playwright e2e tests or both) *(closed out by the frontend unit-test initiative — see the tracker below: 181 backend unit tests, 278 frontend component/hook unit tests, 68 e2e scenarios, 459 tests total)*
- [x] if test data files or folder have to be moved around make sure the test suite cleans them out afterward

## 2. Make this app a desktop app

- Make the architect run an audit to bundle this app into a desktop app
- Assess the complexity, come up with a good approach to do it (including assessing framework to achieve it, Electron maybe?)
- The goal is the app to continue running fine as a web app as well as a desktop app
- What about the data base? it would be nice to have the same database when running the app in web mode (localhost) than running in desktop mode
- Architect creates a report on all these questions, come up with a plan that could be passed to the rest of the /dev-loop afterwards

Prompt:
"Convert this existing application to a desktop application while preserving the existing React frontend, Node.js backend, and SQLite data layer. Do not rewrite working application logic unnecessarily. First analyze the current architecture and identify what must change for packaging, filesystem paths, database persistence, development mode, production builds, and OS-specific behavior. Then implement the migration incrementally and test each layer.

## 3. Code quality and accessibility audit

- Perform an complete audit of the code, the goal is to identify if everything as been implemented with respect to good coding practice and maintainability
- Choose which agent is best to perform this task (probably reviewer with its findings being fed to the developer in next loop)
- additionally make sure the UI implement complete accessibility guidelines  

## 4. Improve the REQUIREMENTS.md document and create README.md documentation

- I want this document to be a complete source of truth of want is implemented
- Remove all reference to this document being retro-engineering
- If needed run the reviewer to make sure REQUIREMENTS.md is accurate to what is present in the source code
- If anything is missing or has inaccuracy list these items in report findings and let's discuss it for further /dev-loop 
- Then create a full README.md documentation file explaining all the features and how to run them
- Keep each feature explanation short and concise
- This README.md will be 

## 6.  I now want to share this repository, making it open source, public and usable by others

- Perform audit on the whole codebase for any cyber-security risk
- Potential risk includes but not limited to credential stealing, API keys left in the codebase, dependency vulnerabilities
- Perform all checks such as npm audit and other vulnerability checks
- If issues are found come up with a plan to resolve them
- Then improve the .gitignore file to not include any potentially dangerous or private files
- If things that should not be commited are there, git rm --cache the files and clean the commit history
so the public repository is safe to be shared online
 
