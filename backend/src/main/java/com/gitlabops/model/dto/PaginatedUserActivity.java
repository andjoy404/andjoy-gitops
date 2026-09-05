package com.gitlabops.model.dto;

import java.util.List;

public class PaginatedUserActivity {

    private List<UserActivity> users;
    private int page;
    private int pageSize;
    private int total;

    public PaginatedUserActivity() {
    }

    public PaginatedUserActivity(List<UserActivity> users, int page, int pageSize, int total) {
        this.users = users;
        this.page = page;
        this.pageSize = pageSize;
        this.total = total;
    }

    public List<UserActivity> getUsers() { return users; }
    public void setUsers(List<UserActivity> users) { this.users = users; }

    public int getPage() { return page; }
    public void setPage(int page) { this.page = page; }

    public int getPageSize() { return pageSize; }
    public void setPageSize(int pageSize) { this.pageSize = pageSize; }

    public int getTotal() { return total; }
    public void setTotal(int total) { this.total = total; }
}
