package com.gitlabops.config;

import javax.sql.DataSource;

import com.zaxxer.hikari.HikariDataSource;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.core.env.Environment;

@Configuration
public class DataSourceConfig {

    @Autowired
    private Environment env;

    @Bean
    @Primary
    public DataSource dataSource() {
        String url = env.getProperty("spring.datasource.url", "jdbc:postgresql://localhost:5432/gitlab_ci_dashboard");
        String username = env.getProperty("spring.datasource.username", "gitlab_ci_dashboard");
        String password = env.getProperty("spring.datasource.password", "");
        String maxPoolSize = env.getProperty("database.max_connections", "10");

        HikariDataSource ds = new HikariDataSource();
        ds.setJdbcUrl(url);
        ds.setUsername(username);
        ds.setPassword(password);
        ds.setMaximumPoolSize(Integer.parseInt(maxPoolSize));
        if (url.contains("h2")) {
            ds.setDriverClassName("org.h2.Driver");
        } else {
            ds.setDriverClassName("org.postgresql.Driver");
            ds.addDataSourceProperty("prepareThreshold", "0");
        }
        return ds;
    }
}
