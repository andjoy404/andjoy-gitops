package com.gitlabops.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * Provides sensible defaults for production REST clients.
 */
@Configuration
public class WebClientConfig {

    @Bean
    public RestTemplate restTemplate() {
        ClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory() {
            @Override
            protected void prepareConnection(java.net.HttpURLConnection connection,
                                             String httpMethod) throws java.io.IOException {
                super.prepareConnection(connection, httpMethod);
                connection.setConnectTimeout(10_000);
                connection.setReadTimeout(30_000);
                connection.setInstanceFollowRedirects(false);
            }
        };
        return new RestTemplate(factory);
    }

    @Bean
    public RestTemplate gitLabRestTemplate() {
        ClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory() {
            @Override
            protected void prepareConnection(java.net.HttpURLConnection connection,
                                             String httpMethod) throws java.io.IOException {
                super.prepareConnection(connection, httpMethod);
                connection.setConnectTimeout(10_000);
                connection.setReadTimeout(30_000);
                connection.setInstanceFollowRedirects(false);
            }
        };
        return new RestTemplate(factory);
    }

    /**
     * Provides a default WebClient for GitLabClient constructor injection.
     * The actual per-environment WebClient is built dynamically via buildClient().
     */
    @Bean
    public WebClient gitlabWebClient() {
        return WebClient.builder()
                .build();
    }
}
