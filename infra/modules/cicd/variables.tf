variable "role_name" {
  description = "IAM role name assumed by GitHub Actions."
  type        = string
}

variable "github_repository" {
  description = "GitHub repository in owner/name format."
  type        = string
}

variable "github_environment" {
  description = "GitHub environment included in the OIDC subject."
  type        = string
}
