variable "aws_region" {
  description = "AWS region for regional resources."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "dev"
}

variable "billing_alert_email" {
  description = "Optional email for a USD 5 monthly AWS budget alert."
  type        = string
  default     = ""
}

variable "allowed_origins" {
  description = "Origins allowed to call the API. Authentication still requires a valid Cognito JWT."
  type        = list(string)
  default     = ["*"]
}
