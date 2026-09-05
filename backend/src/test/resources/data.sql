-- Test fixture data for H2 test database

-- Sync state
INSERT INTO analytics_sync_state (scope, last_started_at, last_completed_at, last_error, updated_at)
VALUES ('pipelines', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', NULL, NOW())
ON DUPLICATE KEY UPDATE last_started_at = NOW() - INTERVAL '2 hours', last_completed_at = NOW() - INTERVAL '1 hour', last_error = NULL, updated_at = NOW();

-- Analytics users
INSERT INTO analytics_users (gitlab_id, group_id, username, name, email, avatar_url, web_url, state, is_admin, is_current_member) VALUES
(11, 123, 'alice', 'Alice Johnson', 'alice@example.com', 'https://gitlab.com/avatars/alice', 'https://gitlab.com/alice', 'active', true, true),
(12, 123, 'bob', 'Bob Smith', 'bob@example.com', 'https://gitlab.com/avatars/bob', 'https://gitlab.com/bob', 'active', false, true),
(13, 123, 'carol', 'Carol Williams', 'carol@example.com', 'https://gitlab.com/avatars/carol', 'https://gitlab.com/carol', 'active', true, true),
(14, 123, 'dave', 'Dave Brown', 'dave@example.com', NULL, 'https://gitlab.com/dave', 'active', false, true),
(15, 123, 'eve', 'Eve Davis', 'eve@example.com', 'https://gitlab.com/avatars/eve', 'https://gitlab.com/eve', 'active', false, false)
ON DUPLICATE KEY UPDATE username = username;

-- Projects
INSERT INTO analytics_projects (gitlab_id, group_id, name, path, web_url, default_branch, namespace_path, topics, jobs_enabled) VALUES
(101, 123, 'web-frontend', 'mygroup/web-frontend', 'https://gitlab.com/mygroup/web-frontend', 'main', 'mygroup', '[]', true),
(102, 123, 'api-backend', 'mygroup/api-backend', 'https://gitlab.com/mygroup/api-backend', 'main', 'mygroup', '[]', true),
(103, 123, 'mobile-app', 'mygroup/mobile-app', 'https://gitlab.com/mygroup/mobile-app', 'develop', 'mygroup', '[]', true),
(104, 123, 'data-pipeline', 'mygroup/data-pipeline', 'https://gitlab.com/mygroup/data-pipeline', 'main', 'mygroup', '["data"]', true),
(105, 123, 'infra-tools', 'mygroup/infra-tools', 'https://gitlab.com/mygroup/infra-tools', 'main', 'mygroup', '["ops"]', true)
ON DUPLICATE KEY UPDATE gitlab_id = gitlab_id;

-- Pipelines with various statuses
INSERT INTO analytics_pipelines (gitlab_id, iid, project_id, sha, branch, status, source, coverage, created_at, updated_at, web_url, author_id) VALUES
(1001, 1, 101, 'abc123', 'main', 'success', 'push', 85.5, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/1001', 11),
(1002, 2, 101, 'def456', 'main', 'success', 'push', 86.2, NOW() - INTERVAL '23 hours', NOW() - INTERVAL '23 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/1002', 12),
(1003, 3, 101, 'ghi789', 'feature-x', 'failed', 'push', 0, NOW() - INTERVAL '22 hours', NOW() - INTERVAL '22 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/1003', 11),
(1004, 4, 102, 'jkl012', 'main', 'success', 'push', 92.1, NOW() - INTERVAL '20 hours', NOW() - INTERVAL '20 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/1004', 13),
(1005, 5, 102, 'mno345', 'main', 'manual', 'merge_request_event', 0, NOW() - INTERVAL '18 hours', NOW() - INTERVAL '18 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/1005', 12),
(1006, 6, 103, 'pqr678', 'develop', 'success', 'push', 78.3, NOW() - INTERVAL '16 hours', NOW() - INTERVAL '16 hours', 'https://gitlab.com/mygroup/mobile-app/-/pipelines/1006', 14),
(1007, 7, 103, 'stu901', 'develop', 'failed', 'push', 0, NOW() - INTERVAL '14 hours', NOW() - INTERVAL '14 hours', 'https://gitlab.com/mygroup/mobile-app/-/pipelines/1007', 11),
(1008, 8, 104, 'vwx234', 'main', 'success', 'push', 88.0, NOW() - INTERVAL '12 hours', NOW() - INTERVAL '12 hours', 'https://gitlab.com/mygroup/data-pipeline/-/pipelines/1008', 15),
(1009, 9, 104, 'yza567', 'main', 'success', 'push', 89.5, NOW() - INTERVAL '10 hours', NOW() - INTERVAL '10 hours', 'https://gitlab.com/mygroup/data-pipeline/-/pipelines/1009', 13),
(1010, 10, 105, 'bcd890', 'main', 'canceled', 'push', 0, NOW() - INTERVAL '8 hours', NOW() - INTERVAL '8 hours', 'https://gitlab.com/mygroup/infra-tools/-/pipelines/1010', 14),
(1011, 11, 101, 'efg123', 'main', 'success', 'merge_request_event', 87.0, NOW() - INTERVAL '6 hours', NOW() - INTERVAL '6 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/1011', 13),
(1012, 12, 102, 'hij456', 'main', 'success', 'push', 91.5, NOW() - INTERVAL '4 hours', NOW() - INTERVAL '4 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/1012', 15),
(1013, 13, 101, 'klm789', 'main', 'running', 'push', NULL, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/1013', 11),
(1014, 14, 103, 'nop012', 'develop', 'success', 'push', 80.0, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour', 'https://gitlab.com/mygroup/mobile-app/-/pipelines/1014', 12),
(1015, 15, 104, 'qrs345', 'main', 'success', 'push', 90.2, NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '30 minutes', 'https://gitlab.com/mygroup/data-pipeline/-/pipelines/1015', 14)
ON DUPLICATE KEY UPDATE gitlab_id = gitlab_id;

-- Runner state
INSERT INTO analytics_runner_state (group_id, payload, collected_at) VALUES
(123, '[{"runner_id":201,"status":"running"},{"runner_id":202,"status":"running"},{"runner_id":203,"status":"idle"},{"runner_id":204,"status":"idle"},{"runner_id":205,"status":"offline"}]', NOW())
ON DUPLICATE KEY UPDATE group_id = group_id;

-- User activity
INSERT INTO analytics_user_activity (user_id, group_id, push_count, merge_request_count, comment_count, issue_count) VALUES
(11, 123, 25, 10, 15, 5),
(12, 123, 15, 8, 10, 3),
(13, 123, 20, 12, 20, 8),
(14, 123, 10, 5, 8, 2),
(15, 123, 8, 6, 12, 10)
ON DUPLICATE KEY UPDATE id = id;

-- User events
INSERT INTO analytics_user_events (event_id, group_id, project_id, user_id, action_name, target_type, occurred_at) VALUES
(1, 123, 101, 11, 'pushed to main', NULL, NOW() - INTERVAL '1 hour'),
(2, 123, 101, 12, 'commented on', 'merge_request', NOW() - INTERVAL '2 hours'),
(3, 123, 102, 13, 'commented on', 'note', NOW() - INTERVAL '3 hours'),
(4, 123, 103, 11, 'commented on', 'diffnote', NOW() - INTERVAL '4 hours'),
(5, 123, 104, 14, 'pushed to main', NULL, NOW() - INTERVAL '5 hours'),
(6, 123, 101, 15, 'mentioned in', 'issue', NOW() - INTERVAL '6 hours'),
(7, 123, 102, 12, 'accepted', 'MergeRequest', NOW() - INTERVAL '1 hour')
ON DUPLICATE KEY UPDATE event_id = event_id;

-- User issues
INSERT INTO analytics_user_issues (issue_id, group_id, project_id, user_id, occurred_at) VALUES
(1, 123, 101, 13, NOW() - INTERVAL '1 hour'),
(2, 123, 102, 15, NOW() - INTERVAL '3 hours'),
(3, 123, 103, 11, NOW() - INTERVAL '5 hours')
ON DUPLICATE KEY UPDATE issue_id = issue_id;

-- User project relations
INSERT INTO analytics_user_project_relations (user_id, project_id, group_id, relation_type, evidence_type, synced_at) VALUES
(11, 101, 123, 'membership', 'membership', NOW() - INTERVAL '1 day'),
(11, 102, 123, 'membership', 'membership', NOW() - INTERVAL '1 day'),
(11, 101, 123, 'activity', 'push', NOW() - INTERVAL '1 day'),
(11, 102, 123, 'activity', 'pipeline', NOW() - INTERVAL '23 hours'),
(12, 101, 123, 'membership', 'membership', NOW() - INTERVAL '1 day'),
(12, 103, 123, 'membership', 'membership', NOW() - INTERVAL '1 day'),
(13, 102, 123, 'activity', 'pipeline', NOW() - INTERVAL '20 hours'),
(13, 104, 123, 'activity', 'pipeline', NOW() - INTERVAL '10 hours'),
(14, 103, 123, 'activity', 'push', NOW() - INTERVAL '5 hours'),
(14, 105, 123, 'activity', 'pipeline', NOW() - INTERVAL '8 hours'),
(15, 104, 123, 'activity', 'pipeline', NOW() - INTERVAL '12 hours'),
(15, 104, 123, 'activity', 'push', NOW() - INTERVAL '6 hours'),
(13, 102, 123, 'activity', 'comment', NOW() - INTERVAL '3 hours')
ON DUPLICATE KEY UPDATE id = id;

-- Jobs
INSERT INTO analytics_jobs (gitlab_id, pipeline_id, project_id, name, stage, branch, status, allow_failure, created_at, web_url) VALUES
(101, 1001, 101, 'compile', 'compile', 'main', 'success', false, NOW() - INTERVAL '1 day 2 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/101'),
(102, 1001, 101, 'test', 'test', 'main', 'success', false, NOW() - INTERVAL '1 day 1 hour', 'https://gitlab.com/mygroup/web-frontend/-/jobs/102'),
(103, 1001, 101, 'deploy', 'deploy', 'main', 'success', true, NOW() - INTERVAL '1 day', 'https://gitlab.com/mygroup/web-frontend/-/jobs/103'),
(104, 1002, 101, 'compile', 'compile', 'main', 'success', false, NOW() - INTERVAL '25 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/104'),
(105, 1002, 101, 'test', 'test', 'main', 'success', false, NOW() - INTERVAL '24 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/105'),
(106, 1002, 101, 'deploy', 'deploy', 'main', 'success', true, NOW() - INTERVAL '23 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/106'),
(107, 1003, 101, 'compile', 'compile', 'feature-x', 'success', false, NOW() - INTERVAL '25 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/107'),
(108, 1003, 101, 'test', 'test', 'feature-x', 'failed', false, NOW() - INTERVAL '24 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/108'),
(109, 1004, 102, 'build', 'build', 'main', 'success', false, NOW() - INTERVAL '22 hours', 'https://gitlab.com/mygroup/api-backend/-/jobs/109'),
(110, 1004, 102, 'unit-test', 'test', 'main', 'success', false, NOW() - INTERVAL '21 hours', 'https://gitlab.com/mygroup/api-backend/-/jobs/110'),
(111, 1004, 102, 'integration-test', 'test', 'main', 'success', false, NOW() - INTERVAL '20 hours', 'https://gitlab.com/mygroup/api-backend/-/jobs/111'),
(112, 1004, 102, 'publish', 'deploy', 'main', 'success', true, NOW() - INTERVAL '20 hours', 'https://gitlab.com/mygroup/api-backend/-/jobs/112'),
(113, 1005, 102, 'build', 'build', 'main', 'success', false, NOW() - INTERVAL '20 hours', 'https://gitlab.com/mygroup/api-backend/-/jobs/113'),
(114, 1005, 102, 'deploy-staging', 'deploy', 'main', 'success', false, NOW() - INTERVAL '19 hours', 'https://gitlab.com/mygroup/api-backend/-/jobs/114'),
(115, 1005, 102, 'deploy-production', 'deploy', 'main', 'manual', false, NOW() - INTERVAL '18 hours', 'https://gitlab.com/mygroup/api-backend/-/jobs/115'),
(116, 1006, 103, 'compile', 'compile', 'develop', 'success', false, NOW() - INTERVAL '18 hours', 'https://gitlab.com/mygroup/mobile-app/-/jobs/10016'),
(117, 1006, 103, 'lint', 'lint', 'develop', 'success', false, NOW() - INTERVAL '17 hours', 'https://gitlab.com/mygroup/mobile-app/-/jobs/10017'),
(118, 1006, 103, 'test', 'test', 'develop', 'success', false, NOW() - INTERVAL '16 hours', 'https://gitlab.com/mygroup/mobile-app/-/jobs/10018'),
(119, 1007, 103, 'compile', 'compile', 'develop', 'success', false, NOW() - INTERVAL '16 hours', 'https://gitlab.com/mygroup/mobile-app/-/jobs/10019'),
(120, 1007, 103, 'test', 'test', 'develop', 'failed', false, NOW() - INTERVAL '15 hours', 'https://gitlab.com/mygroup/mobile-app/-/jobs/10020'),
(121, 1007, 103, 'package', 'package', 'develop', 'skipped', false, NOW() - INTERVAL '14 hours', 'https://gitlab.com/mygroup/mobile-app/-/jobs/10021'),
(122, 1009, 104, 'validate', 'validate', 'main', 'success', false, NOW() - INTERVAL '12 hours', 'https://gitlab.com/mygroup/data-pipeline/-/jobs/10024'),
(123, 1009, 104, 'process', 'process', 'main', 'success', false, NOW() - INTERVAL '11 hours', 'https://gitlab.com/mygroup/data-pipeline/-/jobs/10025'),
(124, 1009, 104, 'report', 'report', 'main', 'success', true, NOW() - INTERVAL '10 hours', 'https://gitlab.com/mygroup/data-pipeline/-/jobs/10026'),
(125, 1010, 105, 'build', 'build', 'main', 'canceled', false, NOW() - INTERVAL '10 hours', 'https://gitlab.com/mygroup/infra-tools/-/jobs/10027'),
(126, 1010, 105, 'test', 'test', 'main', 'canceled', false, NOW() - INTERVAL '9 hours', 'https://gitlab.com/mygroup/infra-tools/-/jobs/10028'),
(127, 1010, 105, 'deploy', 'deploy', 'main', 'canceled', true, NOW() - INTERVAL '8 hours', 'https://gitlab.com/mygroup/infra-tools/-/jobs/10029'),
(128, 1011, 101, 'compile', 'compile', 'main', 'success', false, NOW() - INTERVAL '8 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/10030'),
(129, 1011, 101, 'test', 'test', 'main', 'success', false, NOW() - INTERVAL '7 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/10031'),
(130, 1013, 101, 'compile', 'compile', 'main', 'success', false, NOW() - INTERVAL '2 hours 30 minutes', 'https://gitlab.com/mygroup/web-frontend/-/jobs/10034'),
(131, 1013, 101, 'test', 'test', 'main', 'running', false, NOW() - INTERVAL '2 hours 10 minutes', 'https://gitlab.com/mygroup/web-frontend/-/jobs/10035'),
(132, 1013, 101, 'deploy', 'deploy', 'main', 'pending', false, NOW() - INTERVAL '2 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/10036'),
(133, 1001, 101, 'build', 'build', 'main', 'success', false, NOW() - INTERVAL '1 day', 'https://gitlab.com/mygroup/web-frontend/-/jobs/10001', NOW() - INTERVAL '1 day'),
(134, 1001, 101, 'test', 'test', 'main', 'success', false, NOW() - INTERVAL '1 day', 'https://gitlab.com/mygroup/web-frontend/-/jobs/10002', NOW() - INTERVAL '1 day'),
(135, 1001, 101, 'deploy', 'deploy', 'main', 'success', false, NOW() - INTERVAL '1 day', 'https://gitlab.com/mygroup/web-frontend/-/jobs/10003', NOW() - INTERVAL '1 day'),
(136, 1003, 101, 'build', 'build', 'feature-x', 'success', false, NOW() - INTERVAL '22 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/10004', NOW() - INTERVAL '22 hours'),
(137, 1003, 101, 'test', 'test', 'feature-x', 'failed', false, NOW() - INTERVAL '22 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/10005', NOW() - INTERVAL '22 hours'),
(138, 1013, 101, 'build', 'build', 'main', 'running', false, NOW() - INTERVAL '2 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/10006', NOW() - INTERVAL '2 hours'),
(139, 1013, 101, 'deploy', 'deploy', 'main', 'pending', false, NOW() - INTERVAL '2 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/10007', NOW() - INTERVAL '2 hours'),
(140, 1005, 102, 'build', 'build', 'main', 'success', false, NOW() - INTERVAL '18 hours', 'https://gitlab.com/mygroup/api-backend/-/jobs/10008', NOW() - INTERVAL '18 hours'),
(141, 1005, 102, 'deploy-prod', 'deploy', 'main', 'manual', false, NOW() - INTERVAL '18 hours', 'https://gitlab.com/mygroup/api-backend/-/jobs/10009', NOW() - INTERVAL '18 hours'),
(142, 1007, 103, 'build', 'build', 'develop', 'success', false, NOW() - INTERVAL '14 hours', 'https://gitlab.com/mygroup/mobile-app/-/jobs/10010', NOW() - INTERVAL '14 hours'),
(143, 1007, 103, 'test', 'test', 'develop', 'failed', false, NOW() - INTERVAL '14 hours', 'https://gitlab.com/mygroup/mobile-app/-/jobs/10011', NOW() - INTERVAL '14 hours'),
(144, 1010, 105, 'build', 'build', 'main', 'canceled', false, NOW() - INTERVAL '8 hours', 'https://gitlab.com/mygroup/infra-tools/-/jobs/10012', NOW() - INTERVAL '8 hours'),
(145, 1008, 104, 'lint', 'lint', 'main', 'success', true, NOW() - INTERVAL '12 hours', 'https://gitlab.com/mygroup/data-pipeline/-/jobs/10013', NOW() - INTERVAL '12 hours'),
(146, 1008, 104, 'test-integ', 'integration', 'main', 'failed', true, NOW() - INTERVAL '12 hours', 'https://gitlab.com/mygroup/data-pipeline/-/jobs/10014', NOW() - INTERVAL '12 hours')
ON DUPLICATE KEY UPDATE gitlab_id = gitlab_id;

-- Additional pipelines for pagination testing
INSERT INTO analytics_pipelines (gitlab_id, iid, project_id, sha, branch, status, source, coverage, created_at, updated_at, web_url, author_id) VALUES
(2001, 16, 101, 'aaa111', 'main', 'success', 'push', 90.0, NOW() - INTERVAL '48 hours', NOW() - INTERVAL '48 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2001', 11),
(2002, 17, 101, 'bbb222', 'main', 'success', 'push', 91.0, NOW() - INTERVAL '52 hours', NOW() - INTERVAL '52 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2002', 12),
(2003, 18, 101, 'ccc333', 'develop', 'failed', 'push', 0, NOW() - INTERVAL '56 hours', NOW() - INTERVAL '56 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2003', 11),
(2004, 19, 101, 'ddd444', 'main', 'canceled', 'pull_request_event', NULL, NOW() - INTERVAL '60 hours', NOW() - INTERVAL '60 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2004', 13),
(2005, 16, 102, 'eee555', 'main', 'success', 'push', 85.0, NOW() - INTERVAL '48 hours', NOW() - INTERVAL '48 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2005', 15),
(2006, 17, 102, 'fff666', 'main', 'failed', 'push', 0, NOW() - INTERVAL '50 hours', NOW() - INTERVAL '50 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2006', 12),
(2007, 18, 102, 'ggg777', 'develop', 'success', 'push', 80.0, NOW() - INTERVAL '54 hours', NOW() - INTERVAL '54 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2007', 11),
(2008, 19, 103, 'hhh888', 'develop', 'running', 'push', NULL, NOW() - INTERVAL '58 hours', NOW() - INTERVAL '58 hours', 'https://gitlab.com/mygroup/mobile-app/-/pipelines/2008', 14),
(2009, 20, 104, 'iii999', 'main', 'manual', 'schedule', 95.0, NOW() - INTERVAL '62 hours', NOW() - INTERVAL '62 hours', 'https://gitlab.com/mygroup/data-pipeline/-/pipelines/2009', 15),
(2010, 21, 105, 'jjj000', 'main', 'created', 'push', NULL, NOW() - INTERVAL '66 hours', NOW() - INTERVAL '66 hours', 'https://gitlab.com/mygroup/infra-tools/-/pipelines/2010', 11),
(2011, 22, 101, 'kkk111', 'feature-y', 'success', 'push', 88.0, NOW() - INTERVAL '70 hours', NOW() - INTERVAL '70 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2011', 12),
(2012, 23, 102, 'lll222', 'feature-z', 'skipped', 'merge_request_event', NULL, NOW() - INTERVAL '74 hours', NOW() - INTERVAL '74 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2012', 13),
(2013, 24, 103, 'mmm333', 'release-v2', 'success', 'push', 82.0, NOW() - INTERVAL '78 hours', NOW() - INTERVAL '78 hours', 'https://gitlab.com/mygroup/mobile-app/-/pipelines/2013', 14),
(2014, 25, 104, 'nnn444', 'main', 'pending', 'push', NULL, NOW() - INTERVAL '80 hours', NOW() - INTERVAL '80 hours', 'https://gitlab.com/mygroup/data-pipeline/-/pipelines/2014', 11),
(2015, 26, 101, 'ooo555', 'main', 'success', 'push', 89.5, NOW() - INTERVAL '84 hours', NOW() - INTERVAL '84 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2015', 15),
(2016, 27, 102, 'ppp666', 'main', 'success', 'schedule', 93.0, NOW() - INTERVAL '88 hours', NOW() - INTERVAL '88 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2016', 12),
(2017, 28, 103, 'qqq777', 'develop', 'running', 'push', NULL, NOW() - INTERVAL '92 hours', NOW() - INTERVAL '92 hours', 'https://gitlab.com/mygroup/mobile-app/-/pipelines/2017', 13),
(2018, 29, 104, 'rrr888', 'main', 'success', 'push', 87.0, NOW() - INTERVAL '96 hours', NOW() - INTERVAL '96 hours', 'https://gitlab.com/mygroup/data-pipeline/-/pipelines/2018', 14),
(2019, 30, 105, 'sss999', 'main', 'failed', 'push', 0, NOW() - INTERVAL '100 hours', NOW() - INTERVAL '100 hours', 'https://gitlab.com/mygroup/infra-tools/-/pipelines/2019', 11),
(2020, 31, 101, 'ttt000', 'main', 'success', 'push', 91.5, NOW() - INTERVAL '104 hours', NOW() - INTERVAL '104 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2020', 12),
(2021, 32, 101, 'uuu111', 'main', 'success', 'push', 92.0, NOW() - INTERVAL '108 hours', NOW() - INTERVAL '108 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2021', 13),
(2022, 33, 101, 'vvv222', 'main', 'canceled', 'push', NULL, NOW() - INTERVAL '112 hours', NOW() - INTERVAL '112 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2022', 14),
(2023, 34, 102, 'www333', 'main', 'success', 'push', 84.0, NOW() - INTERVAL '116 hours', NOW() - INTERVAL '116 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2023', 15),
(2024, 35, 102, 'xxx444', 'develop', 'failed', 'push', 0, NOW() - INTERVAL '120 hours', NOW() - INTERVAL '120 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2024', 11),
(2025, 36, 103, 'yyy555', 'develop', 'success', 'schedule', 86.0, NOW() - INTERVAL '124 hours', NOW() - INTERVAL '124 hours', 'https://gitlab.com/mygroup/mobile-app/-/pipelines/2025', 12),
(2026, 37, 104, 'zzz666', 'main', 'pending', 'push', NULL, NOW() - INTERVAL '128 hours', NOW() - INTERVAL '128 hours', 'https://gitlab.com/mygroup/data-pipeline/-/pipelines/2026', 13),
(2027, 38, 105, 'aaa777', 'main', 'success', 'push', 90.5, NOW() - INTERVAL '132 hours', NOW() - INTERVAL '132 hours', 'https://gitlab.com/mygroup/infra-tools/-/pipelines/2027', 14),
(2028, 39, 101, 'bbb888', 'main', 'success', 'web', 91.0, NOW() - INTERVAL '136 hours', NOW() - INTERVAL '136 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2028', 15),
(2029, 4
