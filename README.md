# SmartPass

## QR Code-Based Digital Identity and Access Management System

SmartPass is a web-based digital identity and access management system developed as a Bachelor's degree project in Computer Science. The application provides secure user authentication, QR code-based identity verification, administrator approval workflows, and centralized access management.

The system was designed to demonstrate how modern web technologies and cloud-based backend services can be combined to create a secure, scalable, and user-friendly digital identity platform.

---

## Features

* User registration and authentication
* Personal Access Code verification
* QR Code-based digital identity
* Administrator dashboard
* User management
* Access request approval workflow
* Internal messaging system
* Activity logging
* Reports and monitoring
* Role-based access control
* Responsive web interface

---

## Technologies Used

### Frontend

* HTML5
* CSS3
* JavaScript (ES6)

### Backend

* Supabase Authentication
* PostgreSQL Database
* Supabase Row Level Security (RLS)
* SQL Policies
* PostgreSQL Functions

### Deployment

* GitHub Pages

---

## System Architecture

SmartPass follows a client-server architecture.

**Frontend**

* HTML5
* CSS3
* JavaScript

↓

**Backend**

* Supabase Authentication
* PostgreSQL Database
* REST API
* Row Level Security (RLS)

↓

**Database**

* User accounts
* Digital identity cards
* Access requests
* Approval sessions
* Messages
* Activity logs

---

## Project Structure

```text
SmartPass/
│
├── css/
├── js/
├── admin-login.html
├── approve.html
├── dashboard.html
├── index.html
├── logs.html
├── messages.html
├── my-card.html
├── register.html
├── reports.html
├── requests.html
├── scan.html
├── security.html
├── user-login.html
├── users.html
├── supabase-schema.sql
└── README.md
```

---

## Database

The complete database structure is provided in:

```
supabase-schema.sql
```

The schema contains:

* Database tables
* Relationships
* Authentication support
* Row Level Security (RLS) policies
* SQL functions
* Access control configuration

---

## Live Demo

GitHub Pages

**https://akbulut007.github.io/SmartPass/**

---

## Author

**Muhammed Yusuf Akbulut**

Bachelor's Degree Project

School of Computer Science & Technologies

University of Information Technology and Management (UITM), Warsaw

2026

---

## License

This repository was created for educational purposes as part of a Bachelor's degree project.
