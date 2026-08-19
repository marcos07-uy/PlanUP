terraform {
  backend "s3" {
    bucket  = "planup-backend"
    key     = "planup/dev/terraform.tfstate"
    region  = "sa-east-1"
    encrypt = true
  }
}
