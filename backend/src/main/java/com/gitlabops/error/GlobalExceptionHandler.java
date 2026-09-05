package com.gitlabops.error;

import org.apache.catalina.connector.ClientAbortException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(org.apache.catalina.connector.ClientAbortException.class)
    public void handleClientAbort() {
        log.debug("Client disconnected before response completed");
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, String>> handleAccessDenied(AccessDeniedException e) {
        log.warn("Access denied for user");
        Map<String, String> error = new HashMap<>();
        error.put("error", "Access denied");
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException e) {
        Map<String, String> errors = new HashMap<>();
        for (FieldError fe : e.getBindingResult().getFieldErrors()) {
            errors.merge(fe.getField(), fe.getDefaultMessage(),
                    (existing, newVal) -> existing + "; " + newVal);
        }
        Map<String, Object> result = new HashMap<>();
        result.put("errors", errors);
        return ResponseEntity.badRequest().body(result);
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, String>> handleMissingParam(MissingServletRequestParameterException e) {
        Map<String, String> error = new HashMap<>();
        error.put("error", "Missing parameter: " + e.getParameterName());
        return ResponseEntity.badRequest().body(error);
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<Map<String, String>> handleMediaTypeNotSupported(HttpMediaTypeNotSupportedException e) {
        log.warn("Unsupported media type: {}", e.getContentType());
        Map<String, String> error = new HashMap<>();
        error.put("error", "Unsupported content type. Expected: application/json");
        return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE).body(error);
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Map<String, String>> handleMethodNotSupported(HttpRequestMethodNotSupportedException e) {
        Map<String, String> error = new HashMap<>();
        error.put("error", "Method not supported: " + e.getMethod());
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).body(error);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleGeneral(Exception e) {
        log.error("Unexpected error: ", e);
        HttpStatus status = determineStatus(e, HttpStatus.INTERNAL_SERVER_ERROR);
        Map<String, String> error = new HashMap<>();
        error.put("error", "Internal error");
        return ResponseEntity.status(status).body(error);
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, String>> handleRuntime(RuntimeException e) {
        log.error("Runtime exception: ", e);
        HttpStatus status = determineStatus(e, HttpStatus.INTERNAL_SERVER_ERROR);
        Map<String, String> error = new HashMap<>();
        error.put("error", "Internal error");
        return ResponseEntity.status(status).body(error);
    }

    private HttpStatus determineStatus(Exception e, HttpStatus defaultStatus) {
        if (e instanceof IllegalArgumentException) return HttpStatus.BAD_REQUEST;
        if (e instanceof SecurityException) return HttpStatus.FORBIDDEN;
        return defaultStatus;
    }
}
