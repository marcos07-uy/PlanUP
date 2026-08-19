variable "name" {
  description = "Base name for frontend resources."
  type        = string
}

variable "bucket_name" {
  description = "S3 bucket name for static frontend assets."
  type        = string
}

variable "hosted_zone_name" {
  description = "Route53 public hosted zone name for the frontend domain."
  type        = string
}

variable "frontend_domain_name" {
  description = "Custom domain name for the frontend."
  type        = string
}
