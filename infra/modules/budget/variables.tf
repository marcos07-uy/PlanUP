variable "name" {
  description = "Budget name."
  type        = string
}

variable "billing_alert_email" {
  description = "Optional billing alert recipient."
  type        = string
  default     = ""
}

variable "monthly_limit_usd" {
  description = "Monthly budget limit in USD."
  type        = string
  default     = "5"
}
