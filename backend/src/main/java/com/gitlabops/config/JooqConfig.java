package com.gitlabops.config;

import javax.sql.DataSource;

import org.jooq.DSLContext;
import org.jooq.impl.DSL;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class JooqConfig {

    /**
     * Use Spring-managed DataSource with jOOQ DSLContext.
     * The DataSource is configured via application.yml properties
     * (spring.datasource.url, spring.datasource.username, etc.)
     */
    @Bean
    public DSLContext dslContext(DataSource dataSource) {
        return DSL.using(dataSource, org.jooq.SQLDialect.POSTGRES);
    }
}
