variable "aws_region" {
  description = "AWS region for regional resources."
  type        = string
  default     = "sa-east-1"
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

variable "hosted_zone_name" {
  description = "Route53 public hosted zone name for the frontend domain."
  type        = string
  default     = "marcos-lucas.uy"
}

variable "frontend_domain_name" {
  description = "Custom domain name for the PlanUp frontend."
  type        = string
  default     = "planup.marcos-lucas.uy"
}

variable "github_oidc_subject" {
  description = "Exact customized GitHub OIDC subject allowed to assume the deployment role."
  type        = string
  default     = "repo:marcos07-uy@171387849/PlanUP@1338801998:environment:production"
}
