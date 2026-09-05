package com.gitlabops;

import com.gitlabops.config.AnalyticsProperties;
import com.gitlabops.config.DatabaseProperties;
import com.gitlabops.config.GitlabProperties;
import com.gitlabops.config.SecurityProperties;
import com.gitlabops.config.UiProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties({UiProperties.class, AnalyticsProperties.class, GitlabProperties.class, SecurityProperties.class, DatabaseProperties.class})
public class GitLabOpsApplication {

    public static void main(String[] args) {
        SpringApplication.run(GitLabOpsApplication.class, args);
    }
}
