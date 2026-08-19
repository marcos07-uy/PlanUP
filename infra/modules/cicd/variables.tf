variable "role_name" {
  description = "IAM role name assumed by GitHub Actions."
  type        = string
}

variable "github_oidc_subject" {
  description = "Exact GitHub OIDC subject allowed to assume the role."
  type        = string
}
