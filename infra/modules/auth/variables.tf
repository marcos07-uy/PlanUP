variable "name" {
  description = "Base name for Cognito resources."
  type        = string
}

variable "email_identity_arn" {
  description = "Verified SES identity ARN used by Cognito."
  type        = string
}

variable "from_email_address" {
  description = "Friendly FROM address displayed in Cognito messages."
  type        = string
}
