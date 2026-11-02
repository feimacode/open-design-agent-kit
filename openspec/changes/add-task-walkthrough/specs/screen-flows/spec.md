## ADDED Requirements

### Requirement: Task Paths on the Flow Map

The flow map SHALL draw the path of each task in the flow plan in its own colour, from its start screen to its end screen, and SHALL mark a task with no path as unreachable.

#### Scenario: Two tasks on one map
- **WHEN** a flow plan has the tasks "Change plan" and "Update card"
- **THEN** the map shows both paths in two colours, with a legend naming them
