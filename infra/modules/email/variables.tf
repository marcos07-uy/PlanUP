variable "aws_region" {
  description = "AWS Region where SES sends email."
  type        = string
}

variable "hosted_zone_name" {
  description = "Route53 public hosted zone containing the email domain."
  type        = string
}

variable "email_domain" {
  description = "SES identity used for PlanUp transactional email."
  type        = string
}

variable "mail_from_domain" {
  description = "Custom SES MAIL FROM subdomain."
  type        = string
}
